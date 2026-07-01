// Package sosdata parses the custom data dialect used by Songs of Syx's
// shipped definition and text files (data.zip → data/assets/init/** and
// data/assets/text/**).
//
// The dialect is a JSON5-ish format with game-specific quirks:
//   - Line comments begin with ** and run to end of line.
//   - Trailing commas are allowed in objects and lists.
//   - Object keys and scalar values are unquoted tokens (GRAIN, false, 4),
//     except prose, which is double-quoted and may span multiple lines.
//   - Scalars include color literals (198_106_0), ref/path tokens
//     (32->SERVICE->8), wildcards (*), and the _____ tech-grid placeholder.
//   - A file's top level is a bare object: KEY: VALUE, pairs with no braces.
//   - Brackets [] are a general ordered sequence whose entries may be bare
//     values OR key: value pairs (e.g. sprite FRAMES), with duplicate keys
//     permitted. Both {} and [] are modeled as ordered Member sequences.
//
// Parse turns a file into a generic, order-preserving AST (*Value). Semantic
// decoding into typed structs is left to per-module datagen consumers.
//
// Known data anomalies the parser deliberately rejects (datagen skip-lists
// them rather than the parser loosening its rules and masking real errors):
//   - data/assets/init/event/REGION.txt has a stray "WIP" marker between two
//     top-level entries. The game only tolerates it because its own getKey
//     blindly reads until the next ':', absorbing WIP into the following key.
//   - data/assets/init/config/Charset.txt is a font glyph ordering whose
//     quoted value design is degenerate; it carries no game content.
package sosdata

import (
	"fmt"
	"strings"
)

// Kind distinguishes the three AST node shapes.
type Kind int

const (
	// KindScalar is an atomic token: an unquoted identifier/number or a
	// double-quoted string (Quoted == true).
	KindScalar Kind = iota
	// KindObject is a {}-delimited (or bare top-level) ordered set of
	// KEY: VALUE members.
	KindObject
	// KindList is a []-delimited ordered sequence. Entries are usually
	// keyless values, but the dialect also permits key: value entries.
	KindList
)

func (k Kind) String() string {
	switch k {
	case KindScalar:
		return "scalar"
	case KindObject:
		return "object"
	case KindList:
		return "list"
	default:
		return fmt.Sprintf("Kind(%d)", int(k))
	}
}

// Member is one entry of an object or list. Key is "" for keyless list entries.
type Member struct {
	Key   string
	Value *Value
}

// Value is a node in the parsed AST. Objects and lists both store their entries
// in Members, in source order.
type Value struct {
	Kind Kind

	// Scalar payload (KindScalar).
	Str    string // unquoted token text, or the string content with quotes removed
	Quoted bool   // true if the scalar was a double-quoted string

	Members []Member // KindObject and KindList entries, in source order
}

// Get returns the value of the named member and whether it exists. The first
// member wins if a key appears more than once.
func (v *Value) Get(key string) (*Value, bool) {
	if v == nil {
		return nil, false
	}
	for i := range v.Members {
		if v.Members[i].Key == key {
			return v.Members[i].Value, true
		}
	}
	return nil, false
}

// Keys returns the member keys in source order (keyless list entries yield "").
func (v *Value) Keys() []string {
	if v == nil {
		return nil
	}
	keys := make([]string, len(v.Members))
	for i := range v.Members {
		keys[i] = v.Members[i].Key
	}
	return keys
}

// Len returns the number of members (list or object entries).
func (v *Value) Len() int {
	if v == nil {
		return 0
	}
	return len(v.Members)
}

// At returns the i-th member's value, or nil if out of range.
func (v *Value) At(i int) *Value {
	if v == nil || i < 0 || i >= len(v.Members) {
		return nil
	}
	return v.Members[i].Value
}

// Parse reads a Songs of Syx data file (a bare top-level object) into an AST.
func Parse(data []byte) (*Value, error) {
	psr := &parser{src: string(data)}
	obj, err := psr.parseObject(true)
	if err != nil {
		return nil, err
	}
	psr.skipTrivia()
	if psr.pos < len(psr.src) {
		return nil, fmt.Errorf("sosdata: trailing content at offset %d: %.20q", psr.pos, psr.src[psr.pos:])
	}
	return obj, nil
}

type parser struct {
	src string
	pos int
}

// skipTrivia advances past whitespace and ** line comments.
func (p *parser) skipTrivia() {
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		switch {
		case c == ' ' || c == '\t' || c == '\r' || c == '\n':
			p.pos++
		case c == '*' && p.pos+1 < len(p.src) && p.src[p.pos+1] == '*':
			for p.pos < len(p.src) && p.src[p.pos] != '\n' {
				p.pos++
			}
		default:
			return
		}
	}
}

const delimiters = "{}[]:,\""

// parseObject parses KEY: VALUE members. When topLevel is true the object is
// unbraced and ends at EOF; otherwise the opening '{' has been consumed and it
// ends at the matching '}'.
func (p *parser) parseObject(topLevel bool) (*Value, error) {
	obj := &Value{Kind: KindObject}
	for {
		p.skipTrivia()
		if p.pos >= len(p.src) {
			if topLevel {
				return obj, nil
			}
			return nil, fmt.Errorf("sosdata: unexpected EOF inside object (unbalanced '{')")
		}
		if p.src[p.pos] == '}' {
			if topLevel {
				return nil, fmt.Errorf("sosdata: unexpected '}' at top level (offset %d)", p.pos)
			}
			p.pos++
			return obj, nil
		}

		key, err := p.parseKey()
		if err != nil {
			return nil, err
		}
		p.skipTrivia()
		if p.pos >= len(p.src) || p.src[p.pos] != ':' {
			return nil, fmt.Errorf("sosdata: expected ':' after key %q (offset %d)", key, p.pos)
		}
		p.pos++ // consume ':'

		val, err := p.parseValue()
		if err != nil {
			return nil, err
		}
		obj.Members = append(obj.Members, Member{Key: key, Value: val})
		p.consumeComma()
	}
}

// parseList parses a '['-delimited sequence; the opening '[' is current. Each
// entry is a value, optionally prefixed by "<bare token>:" to give it a key.
func (p *parser) parseList() (*Value, error) {
	p.pos++ // consume '['
	list := &Value{Kind: KindList}
	for {
		p.skipTrivia()
		if p.pos >= len(p.src) {
			return nil, fmt.Errorf("sosdata: unexpected EOF inside list (unbalanced '[')")
		}
		if p.src[p.pos] == ']' {
			p.pos++
			return list, nil
		}

		val, err := p.parseValue()
		if err != nil {
			return nil, err
		}
		// A bare scalar followed by ':' is a keyed entry (e.g. sprite FRAMES).
		p.skipTrivia()
		if p.pos < len(p.src) && p.src[p.pos] == ':' && val.Kind == KindScalar && !val.Quoted {
			p.pos++ // consume ':'
			realVal, rerr := p.parseValue()
			if rerr != nil {
				return nil, rerr
			}
			list.Members = append(list.Members, Member{Key: val.Str, Value: realVal})
		} else {
			list.Members = append(list.Members, Member{Value: val})
		}
		p.consumeComma()
	}
}

// consumeComma tolerates an optional separating/trailing comma.
func (p *parser) consumeComma() {
	p.skipTrivia()
	if p.pos < len(p.src) && p.src[p.pos] == ',' {
		p.pos++
	}
}

// parseKey reads an object key: a bare token or a quoted string.
func (p *parser) parseKey() (string, error) {
	p.skipTrivia()
	if p.pos >= len(p.src) {
		return "", fmt.Errorf("sosdata: expected key, got EOF")
	}
	if p.src[p.pos] == '"' {
		return p.parseString()
	}
	tok := p.parseBareToken()
	if tok == "" {
		return "", fmt.Errorf("sosdata: expected key at offset %d, got %q", p.pos, p.peek())
	}
	return tok, nil
}

// parseValue parses an object, list, or scalar.
func (p *parser) parseValue() (*Value, error) {
	p.skipTrivia()
	if p.pos >= len(p.src) {
		return nil, fmt.Errorf("sosdata: expected value, got EOF")
	}
	switch p.src[p.pos] {
	case '{':
		p.pos++
		return p.parseObject(false)
	case '[':
		return p.parseList()
	case '"':
		s, err := p.parseString()
		if err != nil {
			return nil, err
		}
		return &Value{Kind: KindScalar, Str: s, Quoted: true}, nil
	default:
		tok := p.parseBareToken()
		if tok == "" {
			return nil, fmt.Errorf("sosdata: expected value at offset %d, got %q", p.pos, p.peek())
		}
		return &Value{Kind: KindScalar, Str: tok}, nil
	}
}

// parseString reads a double-quoted string. The opening '"' is current. Inner
// content (newlines and <a KEY label> markup) is preserved verbatim; the
// dialect has no escape sequences.
//
// Matching the game's JsonValue.findValue: the closing quote is the one
// immediately followed by ',' (or at EOF). A quote followed by any other
// character is part of the content (prose contains embedded quotes, e.g.
// denoted by "Unlocks (World)"). The trailing ',' is left for consumeComma.
func (p *parser) parseString() (string, error) {
	open := p.pos
	p.pos++ // consume opening '"'
	for p.pos < len(p.src) {
		if p.src[p.pos] == '"' && (p.pos == len(p.src)-1 || p.src[p.pos+1] == ',') {
			s := p.src[open+1 : p.pos]
			p.pos++ // consume closing '"'
			return s, nil
		}
		p.pos++
	}
	return "", fmt.Errorf("sosdata: unterminated string starting at offset %d", open)
}

// parseBareToken reads an unquoted token: runs until whitespace, a delimiter,
// or the start of a ** comment.
func (p *parser) parseBareToken() string {
	start := p.pos
	for p.pos < len(p.src) {
		c := p.src[p.pos]
		if c == ' ' || c == '\t' || c == '\r' || c == '\n' || strings.IndexByte(delimiters, c) >= 0 {
			break
		}
		if c == '*' && p.pos+1 < len(p.src) && p.src[p.pos+1] == '*' {
			break
		}
		p.pos++
	}
	return p.src[start:p.pos]
}

// peek returns the current byte as a string for error messages, or "EOF".
func (p *parser) peek() string {
	if p.pos >= len(p.src) {
		return "EOF"
	}
	return string(p.src[p.pos])
}
