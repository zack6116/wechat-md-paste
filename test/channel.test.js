import assert from 'node:assert/strict';
import test from 'node:test';
import { isEditorResponse } from '../src/lib/channel.js';

test('ignores the outgoing editor request and accepts only the reply', () => {
  const id = 'req-1';
  const request = {
    source: 'wechat-md-paste',
    direction: 'request',
    id,
    type: 'insert-html',
    payload: { html: '<p>hi</p>' },
  };
  const reply = {
    source: 'wechat-md-paste',
    direction: 'response',
    id,
    ok: true,
    payload: { via: 'mp_editor_insert_html' },
  };
  assert.equal(isEditorResponse(request, id), false);
  assert.equal(isEditorResponse(reply, id), true);
  assert.equal(isEditorResponse({ source: 'wechat-md-paste', id, ok: false, error: '写入正文失败' }, id), true);
  assert.equal(isEditorResponse(reply, 'other'), false);
});
