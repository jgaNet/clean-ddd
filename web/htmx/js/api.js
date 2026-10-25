/**
 * Where the API is, and how the page talks to it. The front end is a client like any other: it
 * may be served by any static server, on any origin, and reaches the API through the base this
 * file reads from `<meta name="api-base">` (empty: the same origin as the page, behind one
 * reverse proxy). Everything the page says about the API goes through here:
 *
 * - every HTMX request to `/v1/…` is prefixed with the base and carries the bearer token;
 * - the websocket (`ws-connect="/ws"`) opens on the API's host, with the token in the query,
 *   the way an API client would, because a cookie does not cross origins;
 * - the token comes from the fragment the login answers (`data-token`), is kept in
 *   localStorage, and is forgotten on logout.
 *
 * Loaded right after htmx and before its extensions: the websocket extension keeps the
 * `htmx.createWebSocket` it finds.
 */
(function configureApi() {
  var meta = document.querySelector('meta[name="api-base"]');
  var base = ((meta && meta.content) || '').replace(/\/$/, '');
  var TOKEN = 'clean-ddd.token';

  function token() {
    try {
      return localStorage.getItem(TOKEN);
    } catch (_) {
      return null;
    }
  }
  function remember(value) {
    try {
      if (value) localStorage.setItem(TOKEN, value);
      else localStorage.removeItem(TOKEN);
    } catch (_) {
      /* a page without storage still works on the same origin, with the cookie */
    }
  }

  // htmx refuses a request to another origin by default; the API is one when a base is set.
  if (base) htmx.config.selfRequestsOnly = false;

  document.body.addEventListener('htmx:configRequest', function (evt) {
    if (base && evt.detail.path.indexOf('/v1') === 0) evt.detail.path = base + evt.detail.path;
    var bearer = token();
    if (bearer) evt.detail.headers['Authorization'] = 'Bearer ' + bearer;
  });

  document.body.addEventListener('htmx:afterSwap', function (evt) {
    var carrier = evt.detail.target && evt.detail.target.querySelector('[data-token]');
    if (carrier) remember(carrier.getAttribute('data-token'));
  });

  document.body.addEventListener('htmx:afterRequest', function (evt) {
    var path = evt.detail.pathInfo && evt.detail.pathInfo.requestPath;
    if (path && /\/auth\/logout$/.test(path)) remember(null);
  });

  htmx.createWebSocket = function (url) {
    var target = new URL(url);
    if (base) {
      var api = new URL(base);
      target.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
      target.host = api.host;
    }
    var bearer = token();
    if (bearer) target.searchParams.set('token', bearer);
    return new WebSocket(target.toString(), []);
  };
})();
