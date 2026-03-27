package main

import (
	"encoding/xml"
	"strings"
	"testing"
)

func parseTestXML(t *testing.T, xmlStr string) *Resolver {
	t.Helper()
	r := NewResolver()
	dec := xml.NewDecoder(strings.NewReader(xmlStr))
	if err := r.LoadFromDecoder(dec, "test.xml"); err != nil {
		t.Fatalf("LoadFromDecoder: %v", err)
	}
	return r
}

func TestResolverSimpleInheritance(t *testing.T) {
	r := parseTestXML(t, `<Defs>
		<ThingDef Name="Base" Abstract="True">
			<category>Item</category>
			<useHitPoints>True</useHitPoints>
		</ThingDef>
		<ThingDef ParentName="Base">
			<defName>Child</defName>
			<label>child item</label>
		</ThingDef>
	</Defs>`)

	resolved, err := r.Resolve("Child")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	// Child should inherit category from parent
	if v := childText(resolved, "category"); v != "Item" {
		t.Errorf("category = %q, want %q", v, "Item")
	}
	// Child should have its own label
	if v := childText(resolved, "label"); v != "child item" {
		t.Errorf("label = %q, want %q", v, "child item")
	}
	// Child should inherit useHitPoints from parent
	if v := childText(resolved, "useHitPoints"); v != "True" {
		t.Errorf("useHitPoints = %q, want %q", v, "True")
	}
}

func TestResolverChildOverridesParent(t *testing.T) {
	r := parseTestXML(t, `<Defs>
		<ThingDef Name="Base" Abstract="True">
			<category>Item</category>
			<selectable>False</selectable>
		</ThingDef>
		<ThingDef ParentName="Base">
			<defName>Child</defName>
			<selectable>True</selectable>
		</ThingDef>
	</Defs>`)

	resolved, err := r.Resolve("Child")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	if v := childText(resolved, "selectable"); v != "True" {
		t.Errorf("selectable = %q, want %q", v, "True")
	}
}

func TestResolverMultiLevelInheritance(t *testing.T) {
	r := parseTestXML(t, `<Defs>
		<ThingDef Name="Grandparent" Abstract="True">
			<category>Plant</category>
			<plant>
				<fertilitySensitivity>1.0</fertilitySensitivity>
				<sowWork>170</sowWork>
			</plant>
		</ThingDef>
		<ThingDef ParentName="Grandparent" Name="Parent" Abstract="True">
			<plant>
				<fertilitySensitivity>0.5</fertilitySensitivity>
			</plant>
		</ThingDef>
		<ThingDef ParentName="Parent">
			<defName>Child</defName>
			<label>child plant</label>
		</ThingDef>
	</Defs>`)

	resolved, err := r.Resolve("Child")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	// category comes from grandparent
	if v := childText(resolved, "category"); v != "Plant" {
		t.Errorf("category = %q, want %q", v, "Plant")
	}
	// fertilitySensitivity overridden by parent
	plant := findChild(resolved, "plant")
	if plant == nil {
		t.Fatal("resolved has no <plant> child")
	}
	if v := childText(plant, "fertilitySensitivity"); v != "0.5" {
		t.Errorf("fertilitySensitivity = %q, want %q", v, "0.5")
	}
	// sowWork inherited from grandparent through parent
	if v := childText(plant, "sowWork"); v != "170" {
		t.Errorf("sowWork = %q, want %q", v, "170")
	}
}

func TestResolverAbstractNotResolvable(t *testing.T) {
	r := parseTestXML(t, `<Defs>
		<ThingDef Name="Base" Abstract="True">
			<category>Item</category>
		</ThingDef>
	</Defs>`)

	// Abstract defs should not be directly resolvable by defName
	_, err := r.Resolve("Base")
	if err == nil {
		t.Error("expected error resolving abstract def, got nil")
	}
}

func TestResolverListOverride(t *testing.T) {
	r := parseTestXML(t, `<Defs>
		<ThingDef Name="Base" Abstract="True">
			<plant>
				<sowTags>
					<li>Ground</li>
					<li>Hydroponic</li>
				</sowTags>
			</plant>
		</ThingDef>
		<ThingDef ParentName="Base">
			<defName>Child</defName>
			<plant>
				<sowTags>
					<li>Ground</li>
				</sowTags>
			</plant>
		</ThingDef>
	</Defs>`)

	resolved, err := r.Resolve("Child")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	plant := findChild(resolved, "plant")
	if plant == nil {
		t.Fatal("resolved has no <plant> child")
	}
	sowTags := findChild(plant, "sowTags")
	if sowTags == nil {
		t.Fatal("plant has no <sowTags> child")
	}
	lis := findChildren(sowTags, "li")
	if len(lis) != 1 {
		t.Errorf("sowTags has %d <li> children, want 1", len(lis))
	}
	if len(lis) > 0 {
		if v := textContent(lis[0]); v != "Ground" {
			t.Errorf("sowTags[0] = %q, want %q", v, "Ground")
		}
	}
}

func TestResolverNestedMerge(t *testing.T) {
	r := parseTestXML(t, `<Defs>
		<ThingDef Name="Base" Abstract="True">
			<statBases>
				<MaxHitPoints>100</MaxHitPoints>
				<Flammability>1</Flammability>
			</statBases>
		</ThingDef>
		<ThingDef ParentName="Base">
			<defName>Child</defName>
			<statBases>
				<MaxHitPoints>200</MaxHitPoints>
			</statBases>
		</ThingDef>
	</Defs>`)

	resolved, err := r.Resolve("Child")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	statBases := findChild(resolved, "statBases")
	if statBases == nil {
		t.Fatal("resolved has no <statBases> child")
	}
	// Child overrides MaxHitPoints
	if v := childText(statBases, "MaxHitPoints"); v != "200" {
		t.Errorf("MaxHitPoints = %q, want %q", v, "200")
	}
	// Child inherits Flammability from parent
	if v := childText(statBases, "Flammability"); v != "1" {
		t.Errorf("Flammability = %q, want %q", v, "1")
	}
}

func TestResolverIterateDefs(t *testing.T) {
	r := parseTestXML(t, `<Defs>
		<ThingDef Name="Base" Abstract="True">
			<category>Item</category>
		</ThingDef>
		<ThingDef ParentName="Base">
			<defName>Alpha</defName>
		</ThingDef>
		<ThingDef ParentName="Base">
			<defName>Beta</defName>
		</ThingDef>
		<StatDef>
			<defName>Speed</defName>
		</StatDef>
	</Defs>`)

	// IterateDefs should yield only concrete defs of the requested type
	var names []string
	r.IterateDefs("ThingDef", func(defName string, el *Element) {
		names = append(names, defName)
	})
	if len(names) != 2 {
		t.Errorf("got %d ThingDefs, want 2: %v", len(names), names)
	}

	var statNames []string
	r.IterateDefs("StatDef", func(defName string, el *Element) {
		statNames = append(statNames, defName)
	})
	if len(statNames) != 1 {
		t.Errorf("got %d StatDefs, want 1: %v", len(statNames), statNames)
	}
}

func TestResolverCrossFileInheritance(t *testing.T) {
	r := NewResolver()

	// Parent defined in file 1
	dec1 := xml.NewDecoder(strings.NewReader(`<Defs>
		<ThingDef Name="Base" Abstract="True">
			<category>Item</category>
		</ThingDef>
	</Defs>`))
	if err := r.LoadFromDecoder(dec1, "file1.xml"); err != nil {
		t.Fatalf("LoadFromDecoder file1: %v", err)
	}

	// Child defined in file 2
	dec2 := xml.NewDecoder(strings.NewReader(`<Defs>
		<ThingDef ParentName="Base">
			<defName>Child</defName>
			<label>cross-file child</label>
		</ThingDef>
	</Defs>`))
	if err := r.LoadFromDecoder(dec2, "file2.xml"); err != nil {
		t.Fatalf("LoadFromDecoder file2: %v", err)
	}

	resolved, err := r.Resolve("Child")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if v := childText(resolved, "category"); v != "Item" {
		t.Errorf("category = %q, want %q", v, "Item")
	}
}

// Helper: find a direct child element by tag name.
func findChild(el *Element, tag string) *Element {
	for _, c := range el.Children {
		if c.Tag == tag {
			return c
		}
	}
	return nil
}

// Helper: get text content of a child element.
func childText(el *Element, tag string) string {
	c := findChild(el, tag)
	if c == nil {
		return ""
	}
	return textContent(c)
}

// Helper: get text content of an element.
func textContent(el *Element) string {
	return strings.TrimSpace(el.Text)
}
