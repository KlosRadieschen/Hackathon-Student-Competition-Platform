// Unit tests for the browser helpers that keep saved text from running as HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, safeUrl } from '../../frontend/public/api.js';

test('escapeHtml turns script payloads into inert text',()=>{
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml(`</textarea><script>alert('x')</script>`),'&lt;/textarea&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
  assert.equal(escapeHtml('Tom & Jerry'),'Tom &amp; Jerry');
  assert.equal(escapeHtml(null),'');
});

test('safeUrl allows only http(s) links',()=>{
  assert.equal(safeUrl('https://github.com/a/b'),'https://github.com/a/b');
  assert.equal(safeUrl('javascript:alert(1)'),'#');
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'),'#');
  assert.equal(safeUrl('not a url'),'#');
});
