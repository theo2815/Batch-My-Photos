import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same mocked-React approach as blurFeedbackUI.test.js: components are called as plain functions.
const hooks = vi.hoisted(() => ({ values: [], cursor: 0 }));
vi.mock('react', () => {
  const useState = initial => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[i], value => { hooks.values[i] = value; }];
  };
  const react = { Component: class {}, createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  return { default: react, useState, useRef: initial => ({ current: initial }), useCallback: fn => fn };
});

import ExecutingCard from '../src/components/StatusCards/ExecutingCard.jsx';
import UndoCompleteCard from '../src/components/StatusCards/UndoCompleteCard.jsx';
import CompleteCard from '../src/components/StatusCards/CompleteCard.jsx';
import UndoConfirmationModal from '../src/components/Modals/UndoConfirmationModal.jsx';
import HistoryModal from '../src/components/Modals/HistoryModal.jsx';

function render(component, props) { hooks.cursor = 0; hooks.values = []; return component(props); }
function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }
function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function badge(entry) {
  const row = nodes(render(HistoryModal, { isOpen: true, history: [entry] })).find(n => n.props?.entry);
  return nodes(render(row.type, row.props)).find(n => String(n.props?.className).startsWith('history-mode-badge'));
}

beforeEach(() => { hooks.values = []; hooks.cursor = 0; });

describe('Undo confirmation box', () => {
  it('says copies are deleted and originals stay, for a Copy run', () => {
    const t = text(render(UndoConfirmationModal, { isOpen: true, rollbackInfo: { mode: 'copy', totalFiles: 1200, batchFolderCount: 4 } }));
    expect(t).toContain('Undo This Copy?');
    expect(t).toContain('This deletes the copies this run made. Your original photos stay where they are.');
    expect(t).toContain('1,200 copies will be deleted');
    expect(t).toContain('4 batch folders will be deleted (if empty)');
    expect(t).toContain('A copy is kept if its original is missing or either file changed after the run. Deleted copies cannot be brought back.');
    expect(t).not.toContain('move all files back');
  });

  it('keeps the Move wording for Move and for records with no mode', () => {
    for (const rollbackInfo of [{ mode: 'move', totalFiles: 3, batchFolderCount: 1 }, { totalFiles: 3, batchFolderCount: 1 }]) {
      const t = text(render(UndoConfirmationModal, { isOpen: true, rollbackInfo }));
      expect(t).toContain('Undo Batch Operation?');
      expect(t).toContain('This will move all files back to their original location.');
      expect(t).toContain('3 files will be restored');
    }
  });
});

describe('Undo done card', () => {
  const base = { restoredFiles: 8, totalFiles: 10, sourceFolder: 'C:/cards/shoot', deletedFolders: 2 };

  it('shows Copies Kept only when some copies were kept', () => {
    const none = text(render(UndoCompleteCard, { undoResult: { ...base, mode: 'copy', keptFiles: 0 } }));
    expect(none).toContain('Copies Removed');
    expect(none).toContain('The copies are deleted. Your original photos were not touched.');
    expect(none).toContain('Originals In');
    expect(none).not.toContain('Copies Kept');
    const some = text(render(UndoCompleteCard, { undoResult: { ...base, mode: 'copy', keptFiles: 2 } }));
    expect(some).toContain('Copies Kept');
    expect(some).toContain('Kept because the original is missing or a file changed after the run. Delete them yourself if you do not need them.');
  });

  it('keeps the Move wording for Move', () => {
    const t = text(render(UndoCompleteCard, { undoResult: { ...base, mode: 'move', keptFiles: 0 } }));
    expect(t).toContain('Undoing Batches Complete!');
    expect(t).toContain('Files Restored');
    expect(t).toContain('Restored To');
    expect(t).not.toContain('Copies');
  });
});

describe('progress and cancelled cards', () => {
  it('names the Copy undo while it runs, and leaves Move alone', () => {
    const copy = text(render(ExecutingCard, { progress: { current: 3, total: 9 }, isRollback: true, rollbackMode: 'copy' }));
    expect(copy).toContain('Removing Copies...');
    expect(copy).toContain('3 of 9 files checked');
    const move = text(render(ExecutingCard, { progress: { current: 3, total: 9 }, isRollback: true, rollbackMode: 'move' }));
    expect(move).toContain('Undoing Batches...');
    expect(move).toContain('3 of 9 files restored');
  });

  it('tells a cancelled Copy run how to remove its copies', () => {
    const note = 'The copies made so far are still in the batch folders. Press Undo to delete them. Your originals are not touched.';
    const props = { rollbackAvailable: true, hasHistory: false };
    const copy = text(render(CompleteCard, { ...props, executionResults: { wasCancelled: true, mode: 'copy', results: [] } }));
    expect(copy).toContain(note);
    expect(text(render(CompleteCard, { ...props, executionResults: { wasCancelled: true, mode: 'move', results: [] } }))).toContain('Files already moved/copied will remain in their new location.');
    expect(text(render(CompleteCard, { ...props, rollbackAvailable: false, executionResults: { wasCancelled: true, mode: 'copy', results: [] } }))).not.toContain(note);
  });
});

describe('History badge', () => {
  const entry = { operationId: 'a', createdAt: new Date().toISOString(), sourceFolder: 'C:/cards/shoot', totalFiles: 5, batchFolderCount: 1 };

  it('reads Copy for a Copy entry', () => {
    const b = badge({ ...entry, mode: 'copy' });
    expect(text(b)).toBe('Copy');
    expect(b.props.className).toBe('history-mode-badge copy');
    expect(b.props.title).toBe('Copy mode: Undo deletes the copies');
  });

  it('reads Move for an entry from an older app version with no mode', () => {
    const b = badge(entry);
    expect(text(b)).toBe('Move');
    expect(b.props.className).toBe('history-mode-badge move');
  });
});
