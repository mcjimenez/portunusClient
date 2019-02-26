/* globals FormData, XMLHttpRequest, document */
!(function(exports) {
  'use strict'; // eslint-disable-line

  //const server = new URL(document.currentScript.src).origin;
  const server = 'https://portunus.work-01.ether.igrupobbva';
  const authURL = server + '/authHelper/index.html';
  const tokenURL = server + '/v1/token/giam';

  const debug = console;

  function sendXHR(aType, aURL, aData, aDataType, aResponseType, aHeaders) {
    return new Promise((resolve, reject) => {
      aData =
        !(aData instanceof FormData) && typeof aData === 'object' && JSON.stringify(aData) || aData;
      const xhr = new XMLHttpRequest();
      xhr.open(aType, aURL);
      xhr.responseType = aResponseType || 'json';
      xhr.overrideMimeType && xhr.overrideMimeType('application/json');
      xhr.withCredentials = true;
      if (aDataType) {
        // Note that this requires
        xhr.setRequestHeader('Content-Type', aDataType);
      }

      if (aHeaders && typeof aHeaders === 'object') {
        Object.keys(aHeaders).forEach(header => xhr.setRequestHeader(header, aHeaders[header]));
      }

      xhr.onload = () => {
        if (xhr.status === 200) {
          const responseType =
           !xhr.responseType && typeof xhr.responseType === 'string' && 'json' || xhr.responseType;
          let response = responseType === 'json' && (xhr.response || {}) || xhr.responseText;
          if (responseType === 'json' && typeof xhr.response === 'string') {
            response = JSON.parse(response);
          }
          resolve(response);
        } else {
          debug.warn('Error getting auth token:', { status: xhr.status, reason: xhr.response });
          reject(new Error('UNAUTHORIZED'));
        }
      };

      xhr.onerror = (aEvt) => {
        debug.error('sendXHR. XHR failed ' + JSON.stringify(aEvt) + 'url: ' +
                    aURL + ' Data: ' + aData + ' RC: ' + xhr.responseCode);
        reject(aEvt);
      };

      xhr.send(aData);
    });
  }

  const Request = {
    sendXHR,
  };

  let authDone = false;
  const getToken = () => Request.sendXHR('GET', tokenURL). //, null, null, null, {"x-consumer-id": "xxx"}).
    then(result => result && result.accessToken && result || Promise.reject(new Error('UNAUTHORIZED')));

  let lastAnswer = null;
  let lastRequestPromise = null;

  // The way this works is:
  //  - ensureAuth() will be called
  //  - if auth is not done, a window will be open to authenticate the calls
  //  - Once the window is closed, we try getting the token, and if it succeeds then we're
  //    authenticated
  const ensureAuth = () => {
    const isValidToken = lastAnswer && lastAnswer.expiresAt > Date.now();
    if (authDone && isValidToken) {
      return lastRequestPromise;
    }
    if (lastRequestPromise == null || !isValidToken) {
      lastRequestPromise = new Promise((solve, reject) => {
        if (!authDone) {
          const authWindow = exports.open(authURL);
          const messageListener = (e) => {
            const { origin } = e;
            if (origin !== server) {
              debug.log('Invalid message, origin: ', origin, 'expected:', server);
              return;
            }
            authDone = true;
          };
          exports.addEventListener('message', messageListener);
          if (!authWindow) {
            return reject(new Error('POPUP_DENY'));
          }
          const int = setInterval(() => {
            if (!authWindow.closed) {
              return;
            }
            clearInterval(int);
            exports.removeEventListener('message', messageListener);
            authDone && (solve() || true) || reject(new Error('UNAUTHORIZED'));
            solve();
          }, 18);
          return null;
        }
        return solve();
      }).then(getToken).then((token) => {
        if (!token) {
          return null;
        }
        lastAnswer = token;
        lastAnswer.expiresAt *= 1000;
        return token.accessToken;
      }).catch((e) => {
        if (authDone) {
          authDone = false;
          return ensureAuth();
        }
        return Promise.reject(e);
      });
    }
    return lastRequestPromise;
  };

  const AuthHelper = {
    ensureAuth,
  };

  exports.AuthHelper = AuthHelper;

}(this));
