/* 学习积分日程表 — GitHub Gist 多设备同步（本地优先，双向合并） */
(function (global) {
  'use strict';
  var U = global.U;
  var API = 'https://api.github.com';
  var Gist = { lastResult: null, etag: null, lastLogin: null };

  function headers(token) {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }

  /* 用于判断"有没有变化"的稳定指纹 */
  function signature(state) {
    if (!state) return '';
    var parts = [(state.settings && state.settings.updatedAt) || '', (state.meta && state.meta.updatedAt) || ''];
    Store.COLLECTIONS.forEach(function (c) {
      var rows = (state[c] || []).map(function (r) { return r.id + ':' + (r.updatedAt || '') + (r.deleted ? ':d' : ''); });
      rows.sort();
      parts.push(c + '(' + rows.length + ')' + rows.join(','));
    });
    return parts.join('|');
  }

  function friendly(status, body) {
    var msg = (body && (body.message || body.error)) || '';
    if (status === 401) return 'Token 无效或已过期，请在设置里重新生成并粘贴（需要 gist 权限）';
    if (status === 403) return '权限不足或被 GitHub 限流，请稍后重试；确认 Token 勾选了 gist 读写权限';
    if (status === 404) return '找不到该 Gist：Gist ID 填错，或 Token 没有访问它的权限';
    if (status === 409) return '刚才有另一台设备也在同步，请再点一次同步';
    if (status === 422) return 'GitHub 拒绝了这次请求：' + msg;
    return 'GitHub 返回 ' + status + (msg ? '：' + msg : '');
  }

  function request(method, path, token, body, extra) {
    var opts = { method: method, headers: headers(token), cache: 'no-store' };
    if (extra) Object.keys(extra).forEach(function (k) { opts.headers[k] = extra[k]; });
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (res) {
      if (res.status === 304) return { ok: true, notModified: true, etag: res.headers.get('ETag') };
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(friendly(res.status, data));
          err.status = res.status; err.data = data;
          throw err;
        }
        return { ok: true, data: data, etag: res.headers.get('ETag') };
      });
    }).catch(function (e) {
      if (e && e.status) throw e;
      var net = new Error('网络请求失败（离线或被浏览器拦截）。离线时本地照常使用，联网后再同步即可。');
      net.network = true;
      throw net;
    });
  }

  Gist.test = function (token) {
    return request('GET', '/user', token).then(function (r) {
      Gist.lastLogin = r.data && r.data.login;
      return { ok: true, login: Gist.lastLogin };
    });
  };

  Gist.create = function (token, filename, content, description) {
    var body = { description: description || '学习积分日程表 数据（请勿手动改动）', public: false, files: {} };
    body.files[filename] = { content: content };
    return request('POST', '/gists', token, body).then(function (r) {
      return { ok: true, id: r.data.id, url: r.data.html_url, etag: r.etag };
    });
  };

  Gist.get = function (token, gistId, filename, etag) {
    var extra = etag ? { 'If-None-Match': etag } : null;
    return request('GET', '/gists/' + gistId, token, null, extra).then(function (r) {
      if (r.notModified) return { ok: true, notModified: true, etag: etag };
      var file = r.data.files && r.data.files[filename];
      if (!file) {
        var keys = Object.keys(r.data.files || {});
        if (keys.length === 1) file = r.data.files[keys[0]];
      }
      var text = file ? (file.content != null ? file.content : '') : '';
      if (file && file.truncated && file.raw_url) {
        return fetch(file.raw_url, { cache: 'no-store' }).then(function (res) { return res.text(); }).then(function (t) {
          return { ok: true, text: t, etag: r.etag, id: r.data.id };
        });
      }
      return { ok: true, text: text, etag: r.etag, id: r.data.id, url: r.data.html_url };
    });
  };

  Gist.update = function (token, gistId, filename, content) {
    var body = { files: {} };
    body.files[filename] = { content: content };
    return request('PATCH', '/gists/' + gistId, token, body).then(function (r) {
      return { ok: true, id: r.data.id, etag: r.etag, url: r.data.html_url };
    });
  };

  /* 记录"上次已经和云端对齐"的指纹，避免 304 时做无意义的上传 */
  function lastSig() { try { return localStorage.getItem('sps.syncSig') || ''; } catch (e) { return ''; } }
  function setLastSig(s) { try { localStorage.setItem('sps.syncSig', s); } catch (e) { } }

  /* 双向同步：先拉云端 → 合并 → 谁落后就把合并结果写回去 */
  Gist.sync = function (state, opts) {
    opts = opts || {};
    var cfg = (state.settings && state.settings.sync) || {};
    var token = (opts.token || cfg.token || '').trim();
    var gistId = (opts.gistId || cfg.gistId || '').trim();
    var filename = cfg.filename || 'study-schedule-data.json';
    var mode = opts.mode || 'both';
    if (!token || !gistId) {
      var e = new Error('还没配置同步：请在「设置 → 多设备同步」里填写 Token 与 Gist ID');
      e.code = 'unconfigured';
      return Promise.reject(e);
    }
    var result = { pulled: false, pushed: false, replaced: false, unchanged: false };

    return Gist.get(token, gistId, filename, mode === 'both' ? Gist.etag : null).then(function (got) {
      var sigLocal = signature(Store.state);
      var payloadText = function (st) {
        return JSON.stringify({ app: 'study-points-schedule', version: Store.VERSION, exportedAt: U.now(), state: st }, null, 0);
      };

      /* 只用本地上传（覆盖云端） */
      if (mode === 'push') {
        return Gist.update(token, gistId, filename, payloadText(Store.state)).then(function (up) {
          Gist.etag = up.etag; result.pushed = true; result.url = up.url;
          setLastSig(sigLocal);
          return result;
        });
      }
      /* 只用云端覆盖本机 */
      if (mode === 'pull') {
        var remoteOnly = got.notModified ? null : Store.fromPayload(safeParse(got.text));
        if (remoteOnly) {
          Store.replaceState(remoteOnly);
          result.replaced = true; result.pulled = true;
          setLastSig(signature(Store.state));
        } else {
          result.unchanged = true;
        }
        Gist.etag = got.etag;
        return result;
      }
      /* 双向合并 */
      var remote = got.notModified ? null : Store.fromPayload(safeParse(got.text));
      Gist.etag = got.etag;
      if (!remote) {
        if (sigLocal === lastSig()) { result.unchanged = true; return result; }
        return Gist.update(token, gistId, filename, payloadText(Store.state)).then(function (up) {
          Gist.etag = up.etag; result.pushed = true;
          setLastSig(sigLocal);
          return result;
        });
      }
      var sigRemote = signature(remote);
      var merged = Store.mergeStates(Store.state, remote);
      var sigMerged = signature(merged);
      if (sigMerged !== sigRemote) {
        return Gist.update(token, gistId, filename, payloadText(merged)).then(function (up) {
          Gist.etag = up.etag; result.pushed = true;
          if (sigMerged !== sigLocal) { Store.replaceState(merged); result.replaced = true; result.pulled = true; }
          setLastSig(sigMerged);
          return result;
        });
      }
      if (sigMerged !== sigLocal) { Store.replaceState(merged); result.replaced = true; result.pulled = true; }
      else { result.unchanged = true; }
      setLastSig(sigMerged);
      return result;
    }).then(function (res) {
      Gist.lastResult = { ok: true, at: U.now(), result: res };
      return res;
    }).catch(function (e) {
      Gist.lastResult = { ok: false, at: U.now(), message: e.message };
      throw e;
    });
  };

  function safeParse(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  Gist.signature = signature;
  global.Gist = Gist;
  if (typeof module !== 'undefined' && module.exports) module.exports = Gist;
})(typeof globalThis !== 'undefined' ? globalThis : this);
