htmx.config.wsReconnectDelay = function (retryCount) {
  return retryCount * 1000; // return value in milliseconds
};

function wsConnecting() {
  // eslint-disable-next-line
  console.log('[WebSocket] Connecting');
}

function wsOpen() {
  // eslint-disable-next-line
  console.log('[WebSocket] Connected');
}

function wsClose() {
  // eslint-disable-next-line
  console.log('[WebSocket] Disconnected');
}

function wsError(error) {
  // eslint-disable-next-line
  console.error('[WebSocket] Error', error);
}

document.body.addEventListener('htmx:wsConnecting', wsConnecting);

// document.body.removeEventListener('htmx:wsOpen', wsOpen);
document.body.addEventListener('htmx:wsOpen', wsOpen);

// document.body.removeEventListener('htmx:wsClose', wsClose);
document.body.addEventListener('htmx:wsClose', wsClose);

// document.body.removeEventListener('htmx:wsError', connect);
document.body.addEventListener('htmx:wsError', wsError);
