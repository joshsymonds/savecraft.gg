package main

import (
	"encoding/xml"
	"fmt"
	"io"
	"maps"
	"os"
	"path/filepath"
	"strings"
)

// Element is a simplified XML element tree used for inheritance resolution.
// RimWorld Defs use ParentName to reference abstract parents — children inherit
// all fields from their parent chain, with child values overriding parent values.
type Element struct {
	Tag      string
	Attrs    map[string]string // XML attributes (Name, ParentName, Abstract, etc.)
	Text     string            // direct text content
	Children []*Element        // child elements
}

// rawDef stores an unresolved def element along with its identifying attributes.
type rawDef struct {
	defType    string // e.g. "ThingDef", "StatDef"
	name       string // Name attribute (for abstract parents)
	parentName string // ParentName attribute
	defName    string // <defName> child text (for concrete defs)
	isAbstract bool
	element    *Element
}

// Resolver loads RimWorld XML Def files, builds a parent inheritance map,
// and resolves concrete defs by merging parent fields.
type Resolver struct {
	// byName maps the Name attribute to raw defs (abstract or concrete parents).
	byName map[string]*rawDef
	// byDefName maps "defType:defName" to raw defs (concrete defs).
	// Namespaced by type to prevent collisions (e.g., ThingDef and ResearchProjectDef
	// can both have defName "MultiAnalyzer").
	byDefName map[string]*rawDef
	// all stores every raw def in load order.
	all []*rawDef
	// resolved caches fully-resolved elements by "defType:defName".
	resolved map[string]*Element
}

// NewResolver creates an empty resolver ready to load XML files.
func NewResolver() *Resolver {
	return &Resolver{
		byName:    make(map[string]*rawDef),
		byDefName: make(map[string]*rawDef),
		resolved:  make(map[string]*Element),
	}
}

// LoadDir recursively loads all .xml files from a directory.
func (r *Resolver) LoadDir(dir string) error {
	return filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(strings.ToLower(path), ".xml") {
			return nil
		}
		return r.LoadFile(path)
	})
}

// LoadFile loads a single XML file into the resolver.
func (r *Resolver) LoadFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	dec := xml.NewDecoder(f)
	return r.LoadFromDecoder(dec, path)
}

// LoadFromDecoder parses XML from a decoder and registers all Def elements.
func (r *Resolver) LoadFromDecoder(dec *xml.Decoder, source string) error {
	root, err := parseElement(dec)
	if err != nil {
		return fmt.Errorf("%s: %w", source, err)
	}
	if root == nil || root.Tag != "Defs" {
		return fmt.Errorf("%s: expected <Defs> root element, got <%s>", source, root.Tag)
	}
	for _, child := range root.Children {
		if !strings.HasSuffix(child.Tag, "Def") {
			continue
		}
		rd := &rawDef{
			defType:    child.Tag,
			name:       child.Attrs["Name"],
			parentName: child.Attrs["ParentName"],
			isAbstract: strings.EqualFold(child.Attrs["Abstract"], "true"),
			element:    child,
		}
		// Extract defName from child element text
		if dn := findChildElement(child, "defName"); dn != nil {
			rd.defName = strings.TrimSpace(dn.Text)
		}
		r.all = append(r.all, rd)
		if rd.name != "" {
			r.byName[rd.name] = rd
		}
		if rd.defName != "" {
			r.byDefName[rd.defType+":"+rd.defName] = rd
		}
	}
	return nil
}

// Resolve returns a fully-resolved element for a concrete def (by defName).
// Abstract defs cannot be resolved directly. If defType is provided, it
// narrows the lookup to that specific def type to avoid cross-type collisions.
func (r *Resolver) Resolve(defName string) (*Element, error) {
	return r.ResolveTyped("", defName)
}

// ResolveTyped returns a fully-resolved element for a concrete def of the given type.
func (r *Resolver) ResolveTyped(defType, defName string) (*Element, error) {
	key := defName
	if defType != "" {
		key = defType + ":" + defName
	}
	if cached, ok := r.resolved[key]; ok {
		return cached, nil
	}
	var rd *rawDef
	if defType != "" {
		rd = r.byDefName[key]
	} else {
		// Legacy: search all types for this defName
		for _, candidate := range r.all {
			if candidate.defName == defName && !candidate.isAbstract {
				rd = candidate
				break
			}
		}
	}
	if rd == nil {
		return nil, fmt.Errorf("def %q not found", defName)
	}
	if rd.isAbstract {
		return nil, fmt.Errorf("def %q is abstract and cannot be resolved directly", defName)
	}
	resolved, err := r.resolveRaw(rd)
	if err != nil {
		return nil, err
	}
	r.resolved[key] = resolved
	return resolved, nil
}

// IterateDefs calls fn for each concrete (non-abstract) def of the given type.
// The element passed to fn is fully resolved with inherited fields.
func (r *Resolver) IterateDefs(defType string, fn func(defName string, el *Element)) {
	for _, rd := range r.all {
		if rd.defType != defType || rd.isAbstract || rd.defName == "" {
			continue
		}
		resolved, err := r.ResolveTyped(defType, rd.defName)
		if err != nil {
			continue
		}
		fn(rd.defName, resolved)
	}
}

// resolveRaw recursively resolves a raw def by merging parent chain.
func (r *Resolver) resolveRaw(rd *rawDef) (*Element, error) {
	if rd.parentName == "" {
		return cloneElement(rd.element), nil
	}
	parent, ok := r.byName[rd.parentName]
	if !ok {
		// Try type-namespaced defName as fallback — some non-abstract defs are used as parents
		parent, ok = r.byDefName[rd.defType+":"+rd.parentName]
		if !ok {
			return nil, fmt.Errorf("parent %q not found for def %q", rd.parentName, rd.defName)
		}
	}
	parentResolved, err := r.resolveRaw(parent)
	if err != nil {
		return nil, fmt.Errorf("resolving parent %q: %w", rd.parentName, err)
	}
	return mergeElements(parentResolved, rd.element), nil
}

// mergeElements merges child into parent. Child values override parent values.
// For nested elements (non-leaf), merges recursively. For leaf elements and
// list containers (elements whose children are all <li>), child replaces parent.
func mergeElements(parent, child *Element) *Element {
	result := &Element{
		Tag:   child.Tag,
		Attrs: mergeAttrs(parent.Attrs, child.Attrs),
		Text:  child.Text,
	}

	// If child has no children, it fully overrides parent (leaf node or empty element)
	if len(child.Children) == 0 {
		if child.Text != "" || len(parent.Children) == 0 {
			// Child is a leaf with text, or both are empty — use child
			result.Children = cloneChildren(parent.Children)
			if child.Text != "" {
				result.Children = nil // text content replaces children
			}
			return result
		}
		// Child is an empty element with no text — inherit parent children
		result.Children = cloneChildren(parent.Children)
		return result
	}

	// If child has <li> children, it's a list — replace entirely
	if isListElement(child) {
		result.Children = cloneChildren(child.Children)
		return result
	}

	// Recursive merge: start with parent children, override with child children
	childByTag := make(map[string]*Element)
	for _, cc := range child.Children {
		childByTag[cc.Tag] = cc
	}

	// Copy parent children, merging where child has overrides
	seen := make(map[string]bool)
	for _, pc := range parent.Children {
		if cc, ok := childByTag[pc.Tag]; ok {
			if isLeafOrList(cc) {
				result.Children = append(result.Children, cloneElement(cc))
			} else {
				result.Children = append(result.Children, mergeElements(pc, cc))
			}
			seen[pc.Tag] = true
		} else {
			result.Children = append(result.Children, cloneElement(pc))
		}
	}
	// Add child-only children (not in parent)
	for _, cc := range child.Children {
		if !seen[cc.Tag] {
			result.Children = append(result.Children, cloneElement(cc))
		}
	}

	return result
}

// isListElement returns true if the element's children are all <li> tags.
func isListElement(el *Element) bool {
	if len(el.Children) == 0 {
		return false
	}
	for _, c := range el.Children {
		if c.Tag != "li" {
			return false
		}
	}
	return true
}

// isLeafOrList returns true if the element is a leaf (has text, no children)
// or a list container (all children are <li>).
func isLeafOrList(el *Element) bool {
	if len(el.Children) == 0 {
		return true
	}
	return isListElement(el)
}

// cloneElement creates a deep copy of an element.
func cloneElement(el *Element) *Element {
	if el == nil {
		return nil
	}
	c := &Element{
		Tag:  el.Tag,
		Text: el.Text,
	}
	if el.Attrs != nil {
		c.Attrs = make(map[string]string, len(el.Attrs))
		maps.Copy(c.Attrs, el.Attrs)
	}
	c.Children = cloneChildren(el.Children)
	return c
}

func cloneChildren(children []*Element) []*Element {
	if len(children) == 0 {
		return nil
	}
	out := make([]*Element, len(children))
	for i, c := range children {
		out[i] = cloneElement(c)
	}
	return out
}

func mergeAttrs(parent, child map[string]string) map[string]string {
	if len(parent) == 0 && len(child) == 0 {
		return nil
	}
	m := make(map[string]string, len(parent)+len(child))
	maps.Copy(m, parent)
	maps.Copy(m, child)
	// Remove inheritance-related attrs from resolved output
	delete(m, "ParentName")
	delete(m, "Abstract")
	return m
}

func findChildElement(el *Element, tag string) *Element {
	for _, c := range el.Children {
		if c.Tag == tag {
			return c
		}
	}
	return nil
}

// parseElement parses an XML token stream into an Element tree.
// It finds the first start element and builds the tree from there.
func parseElement(dec *xml.Decoder) (*Element, error) {
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return nil, fmt.Errorf("unexpected EOF")
		}
		if err != nil {
			return nil, err
		}
		if se, ok := tok.(xml.StartElement); ok {
			return parseElementFrom(dec, se)
		}
	}
}

// parseElementFrom parses an element tree starting from a StartElement token.
func parseElementFrom(dec *xml.Decoder, se xml.StartElement) (*Element, error) {
	el := &Element{
		Tag: se.Name.Local,
	}
	if len(se.Attr) > 0 {
		el.Attrs = make(map[string]string, len(se.Attr))
		for _, a := range se.Attr {
			el.Attrs[a.Name.Local] = a.Value
		}
	}

	var textBuf strings.Builder
	for {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			child, err := parseElementFrom(dec, t)
			if err != nil {
				return nil, err
			}
			el.Children = append(el.Children, child)
		case xml.CharData:
			textBuf.Write(t)
		case xml.EndElement:
			el.Text = textBuf.String()
			return el, nil
		}
	}
}
