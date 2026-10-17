/**
 * Cancels the browser's default action for drag-and-drop on `target`, so a
 * file dropped outside a drop zone is never opened in the app window (C-16).
 * Only preventDefault: the drop zones' own handlers still see every event.
 */
export function preventStrayDrops(target) {
  const cancel = (event) => event.preventDefault();
  target.addEventListener('dragover', cancel);
  target.addEventListener('drop', cancel);
}
