import { describe, expect, it } from '@jest/globals';
import { XMLElement } from '../xml-element.js';

describe('XMLElement', () => {
  describe('getAttribute', () => {
    it('returns the attribute value when present', () => {
      const el = new XMLElement({ $: { deviceID: 'abc' } });
      expect(el.getAttribute('deviceID')).toBe('abc');
    });

    it('returns undefined when the attribute is missing', () => {
      const el = new XMLElement({ $: { deviceID: 'abc' } });
      expect(el.getAttribute('other')).toBeUndefined();
    });

    it('returns undefined when there are no attributes', () => {
      const el = new XMLElement({});
      expect(el.getAttribute('deviceID')).toBeUndefined();
    });
  });

  describe('getText', () => {
    it('reads text from a child field stored as an array', () => {
      const el = new XMLElement({ name: ['Kitchen'] });
      expect(el.getText('name')).toBe('Kitchen');
    });

    it('reads text of the element itself when no field is given', () => {
      const el = new XMLElement({ $: { total: '5' }, _: 'hello' });
      expect(el.getText()).toBe('hello');
    });

    it('reads text from a plain string field', () => {
      const el = new XMLElement({ name: 'Kitchen' });
      expect(el.getText('name')).toBe('Kitchen');
    });

    it('reads text from an object field with a _ property', () => {
      const el = new XMLElement({ name: [{ _: 'Kitchen', $: { a: '1' } }] });
      expect(el.getText('name')).toBe('Kitchen');
    });

    it('returns undefined for an empty array field', () => {
      const el = new XMLElement({ name: [] });
      expect(el.getText('name')).toBeUndefined();
    });

    it('returns undefined for a missing field', () => {
      const el = new XMLElement({});
      expect(el.getText('name')).toBeUndefined();
    });

    it('returns undefined when the element itself has no text', () => {
      const el = new XMLElement(42);
      expect(el.getText()).toBeUndefined();
    });
  });

  describe('hasAttribute', () => {
    it('returns true when the attribute exists', () => {
      const el = new XMLElement({ $: { source: 'AUX' } });
      expect(el.hasAttribute('source')).toBe(true);
    });

    it('returns false when the attribute is missing', () => {
      const el = new XMLElement({ $: { source: 'AUX' } });
      expect(el.hasAttribute('status')).toBe(false);
    });

    it('returns false when there are no attributes', () => {
      const el = new XMLElement({});
      expect(el.hasAttribute('source')).toBe(false);
    });
  });

  describe('hasAttributes', () => {
    it('returns true when all attributes exist', () => {
      const el = new XMLElement({ $: { source: 'AUX', status: 'READY' } });
      expect(el.hasAttributes(['source', 'status'])).toBe(true);
    });

    it('returns false when any attribute is missing', () => {
      const el = new XMLElement({ $: { source: 'AUX' } });
      expect(el.hasAttributes(['source', 'status'])).toBe(false);
    });

    it('returns false when there are no attributes', () => {
      const el = new XMLElement({});
      expect(el.hasAttributes(['source'])).toBe(false);
    });
  });

  describe('hasChild / hasChildren', () => {
    it('hasChild returns true for an object/array child', () => {
      const el = new XMLElement({ ContentItem: [{ $: {} }] });
      expect(el.hasChild('ContentItem')).toBe(true);
    });

    it('hasChild returns false for a missing child', () => {
      const el = new XMLElement({});
      expect(el.hasChild('ContentItem')).toBe(false);
    });

    it('hasChildren returns true when all children are present', () => {
      const el = new XMLElement({ name: ['x'], type: ['y'] });
      expect(el.hasChildren(['name', 'type'])).toBe(true);
    });

    it('hasChildren returns false when any child is missing', () => {
      const el = new XMLElement({ name: ['x'] });
      expect(el.hasChildren(['name', 'type'])).toBe(false);
    });
  });

  describe('getChild', () => {
    it('returns a wrapped element for an array child', () => {
      const el = new XMLElement({ ContentItem: [{ $: { source: 'AUX' } }] });
      const child = el.getChild('ContentItem');
      expect(child).toBeInstanceOf(XMLElement);
      expect(child?.getAttribute('source')).toBe('AUX');
    });

    it('returns a wrapped element for a non-array child', () => {
      const el = new XMLElement({ ContentItem: { $: { source: 'AUX' } } });
      expect(el.getChild('ContentItem')?.getAttribute('source')).toBe('AUX');
    });

    it('returns undefined for a missing child', () => {
      const el = new XMLElement({});
      expect(el.getChild('ContentItem')).toBeUndefined();
    });

    it('returns undefined for an empty array child', () => {
      const el = new XMLElement({ ContentItem: [] });
      expect(el.getChild('ContentItem')).toBeUndefined();
    });
  });

  describe('getList', () => {
    it('returns a wrapped element per array entry', () => {
      const el = new XMLElement({
        member: [{ $: { ipaddress: '1' } }, { $: { ipaddress: '2' } }],
      });
      const list = el.getList('member');
      expect(list).toHaveLength(2);
      expect(list[0].getAttribute('ipaddress')).toBe('1');
      expect(list[1].getAttribute('ipaddress')).toBe('2');
    });

    it('returns an empty array when the field is not an array', () => {
      const el = new XMLElement({ member: { $: {} } });
      expect(el.getList('member')).toEqual([]);
    });

    it('returns an empty array when the field is missing', () => {
      const el = new XMLElement({});
      expect(el.getList('member')).toEqual([]);
    });
  });
});
