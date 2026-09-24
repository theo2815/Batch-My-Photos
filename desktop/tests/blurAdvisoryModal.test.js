import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => {
  const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
  return {
    default: { createElement },
    useState: initial => [initial, () => {}],
    useEffect: () => {},
  };
});
vi.mock('lucide-react', () => ({ ScanEye: 'svg' }));

import BlurSensitivityModal from '../src/components/Modals/BlurSensitivityModal.jsx';

function walk(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.props?.children || []) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return (node.props?.children || []).map(textOf).join('');
}

const props = {
  isOpen: true,
  currentCategories: ['motion_blurred'],
  currentSensitivity: 'moderate',
  onCancel() {},
};

describe('blur analysis start disclosure', () => {
  it('shows the beta upload and advisory notice before Start Analysis, then starts with chosen settings', () => {
    const onStart = vi.fn();
    const tree = BlurSensitivityModal({ ...props, isBeta: true, onStart });
    const start = walk(tree, node => node.type === 'button' && textOf(node).includes('Start Analysis'));
    const notice = walk(tree, node => node.type === 'p' && textOf(node).includes('staging'));

    expect(notice).not.toBeNull();
    expect(textOf(notice)).toMatch(/resized photos.*staging/i);
    expect(textOf(notice)).toMatch(/suggestions.*(move|exclude)/i);
    expect(textOf(tree)).not.toContain('Sharp photos are always kept.');
    expect(textOf(tree).indexOf('Resized photos')).toBeLessThan(textOf(tree).indexOf('Start Analysis'));
    expect(start).not.toBeNull();
    start.props.onClick();
    expect(onStart).toHaveBeenCalledWith({ categories: ['motion_blurred'], sensitivity: 'moderate' });
  });

  it('retains the existing non-beta copy without a staging notice', () => {
    const tree = BlurSensitivityModal({ ...props, isBeta: false, onStart() {} });
    expect(textOf(tree)).toContain('Sharp photos are always kept.');
    expect(textOf(tree)).not.toMatch(/staging/i);
  });
});
