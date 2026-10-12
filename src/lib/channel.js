export const EDITOR_SOURCE = 'wechat-md-paste';

// The content script posts a request on window, then listens for the reply.
// Both use the same source and id, so a reply must carry ok. A request does not.
export function isEditorResponse(data, id) {
  return !!data
    && data.source === EDITOR_SOURCE
    && data.id === id
    && data.direction !== 'request'
    && typeof data.ok === 'boolean';
}
