/**
 * JellyStream - Authentik Device Code Flow Authentication
 * Implements RFC 8628 Device Authorization Grant for TV apps
 */
(function(window) {
    'use strict';

    var AuthentikAuth = {
        // Authentik OAuth2 configuration
        config: {
            clientId: 'jellyfin-sso',
            // Use proxy to avoid CORS issues in development
            deviceEndpoint: '/api/authentik/device/',
            tokenEndpoint: '/api/authentik/token/',
            scope: 'openid profile email',
            // Jellyfin SSO endpoints (use proxy to avoid CORS)
            jellyfinSsoProvider: 'authentik',
            jellyfinBaseUrl: '/api/jellyfin',
            jellyfinDirectUrl: 'https://jellyfin.streamy.tube'
        },

        // Current device code session
        _deviceCode: null,
        _userCode: null,
        _verificationUri: null,
        _expiresAt: null,
        _pollInterval: null,
        _pollIntervalMs: 5000, // Default 5 seconds

        /**
         * Start device code flow
         * @returns {Promise} Resolves with {userCode, verificationUri, verificationUriComplete}
         */
        startDeviceFlow: function() {
            var self = this;

            console.log('AuthentikAuth: Starting device code flow');

            var body = new URLSearchParams({
                client_id: this.config.clientId,
                scope: this.config.scope
            });

            return fetch(this.config.deviceEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            })
            .then(function(response) {
                if (!response.ok) {
                    return response.text().then(function(text) {
                        throw new Error('Device code request failed: ' + response.status + ' - ' + text);
                    });
                }
                return response.json();
            })
            .then(function(data) {
                console.log('AuthentikAuth: Device code received', data);

                // Store device code session
                self._deviceCode = data.device_code;
                self._userCode = data.user_code;
                self._verificationUri = data.verification_uri;
                self._expiresAt = Date.now() + (data.expires_in * 1000);
                self._pollIntervalMs = (data.interval || 5) * 1000;

                return {
                    userCode: data.user_code,
                    verificationUri: data.verification_uri,
                    verificationUriComplete: data.verification_uri_complete,
                    expiresIn: data.expires_in
                };
            });
        },

        /**
         * Poll for authorization
         * @param {Function} onAuthorized - Called when user authorizes
         * @param {Function} onError - Called on error
         * @param {Function} onExpired - Called when device code expires
         */
        pollForAuthorization: function(onAuthorized, onError, onExpired) {
            var self = this;

            if (!this._deviceCode) {
                onError(new Error('No device code available. Call startDeviceFlow first.'));
                return;
            }

            console.log('AuthentikAuth: Starting authorization polling');

            this._pollInterval = setInterval(function() {
                // Check if expired
                if (Date.now() >= self._expiresAt) {
                    self.stopPolling();
                    onExpired();
                    return;
                }

                self._checkAuthorization()
                    .then(function(result) {
                        if (result.authorized) {
                            self.stopPolling();
                            onAuthorized(result.tokens);
                        }
                        // If not authorized yet, continue polling
                    })
                    .catch(function(error) {
                        // authorization_pending is expected, don't stop
                        if (error.code !== 'authorization_pending' && error.code !== 'slow_down') {
                            self.stopPolling();
                            onError(error);
                        } else if (error.code === 'slow_down') {
                            // Slow down - increase interval
                            self._pollIntervalMs += 5000;
                            console.log('AuthentikAuth: Slowing down, new interval:', self._pollIntervalMs);
                        }
                    });
            }, this._pollIntervalMs);
        },

        /**
         * Check if authorization is complete
         * @returns {Promise} Resolves with {authorized: boolean, tokens?: object}
         */
        _checkAuthorization: function() {
            var self = this;

            var body = new URLSearchParams({
                client_id: this.config.clientId,
                device_code: this._deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            });

            return fetch(this.config.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            })
            .then(function(response) {
                return response.json().then(function(data) {
                    if (!response.ok) {
                        var error = new Error(data.error_description || data.error);
                        error.code = data.error;
                        throw error;
                    }
                    return data;
                });
            })
            .then(function(tokens) {
                console.log('AuthentikAuth: Authorization successful');
                return {
                    authorized: true,
                    tokens: {
                        accessToken: tokens.access_token,
                        idToken: tokens.id_token,
                        refreshToken: tokens.refresh_token,
                        expiresIn: tokens.expires_in,
                        tokenType: tokens.token_type
                    }
                };
            });
        },

        /**
         * Stop polling for authorization
         */
        stopPolling: function() {
            if (this._pollInterval) {
                clearInterval(this._pollInterval);
                this._pollInterval = null;
            }
            this._deviceCode = null;
            this._userCode = null;
        },

        /**
         * Exchange Authentik tokens for Jellyfin session
         * Uses the Jellyfin SSO plugin's API endpoint
         * @param {Object} tokens - Authentik tokens from device flow
         * @returns {Promise} Resolves with Jellyfin session data
         */
        exchangeForJellyfinSession: function(tokens) {
            var self = this;

            console.log('AuthentikAuth: Exchanging Authentik token for Jellyfin session');

            // The Jellyfin SSO plugin expects an OAuth callback with the token
            // We'll use the SSO plugin's direct authentication endpoint
            var ssoUrl = this.config.jellyfinBaseUrl + '/sso/OID/start/' + this.config.jellyfinSsoProvider;

            // Try direct token authentication (via proxy to avoid CORS)
            return fetch(ssoUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + tokens.accessToken
                },
                body: JSON.stringify({
                    id_token: tokens.idToken,
                    access_token: tokens.accessToken
                })
            })
            .then(function(response) {
                if (!response.ok) {
                    // If POST doesn't work, try the callback approach
                    return self._tryCallbackAuth(tokens);
                }
                return response.json();
            })
            .then(function(data) {
                if (data && data.AccessToken) {
                    return {
                        success: true,
                        userId: data.User.Id,
                        userName: data.User.Name,
                        accessToken: data.AccessToken,
                        serverId: data.ServerId
                    };
                }
                throw new Error('Invalid Jellyfin session response');
            });
        },

        /**
         * Try callback-style authentication
         * Some SSO plugins expect the OAuth callback format
         */
        _tryCallbackAuth: function(tokens) {
            var self = this;

            // Try the standard OAuth callback with the id_token
            var callbackUrl = this.config.jellyfinBaseUrl + '/sso/OID/r/' + this.config.jellyfinSsoProvider;

            return fetch(callbackUrl + '?id_token=' + encodeURIComponent(tokens.idToken), {
                method: 'GET',
                redirect: 'follow'
            })
            .then(function(response) {
                // The SSO plugin may redirect to Jellyfin with a session cookie
                // Check if we got a valid response
                if (response.ok) {
                    return response.json().catch(function() {
                        // Response might not be JSON - check for cookies/redirect
                        return self._extractSessionFromResponse(response);
                    });
                }
                throw new Error('SSO callback failed: ' + response.status);
            });
        },

        /**
         * Extract session info from SSO response
         * Fallback when the response isn't JSON
         */
        _extractSessionFromResponse: function(response) {
            // Try to get session from Jellyfin after SSO redirect
            return fetch(this.config.jellyfinBaseUrl + '/Users/Me')
            .then(function(userResponse) {
                if (userResponse.ok) {
                    return userResponse.json().then(function(user) {
                        return {
                            success: true,
                            userId: user.Id,
                            userName: user.Name,
                            // Token might be in cookie
                            accessToken: null,
                            serverId: user.ServerId
                        };
                    });
                }
                throw new Error('Could not extract Jellyfin session');
            });
        },

        /**
         * Complete authentication flow
         * Combines device flow with Jellyfin exchange
         * @param {Object} callbacks - {onCode, onAuthorized, onJellyfinSession, onError, onExpired}
         */
        authenticate: function(callbacks) {
            var self = this;

            callbacks = callbacks || {};

            this.startDeviceFlow()
                .then(function(deviceData) {
                    // Notify caller of the device code
                    if (callbacks.onCode) {
                        callbacks.onCode(deviceData);
                    }

                    // Start polling
                    self.pollForAuthorization(
                        function(tokens) {
                            // Got Authentik tokens
                            if (callbacks.onAuthorized) {
                                callbacks.onAuthorized(tokens);
                            }

                            // Exchange for Jellyfin session
                            self.exchangeForJellyfinSession(tokens)
                                .then(function(session) {
                                    if (callbacks.onJellyfinSession) {
                                        callbacks.onJellyfinSession(session);
                                    }
                                })
                                .catch(function(error) {
                                    console.error('AuthentikAuth: Jellyfin exchange failed', error);
                                    if (callbacks.onError) {
                                        callbacks.onError(error);
                                    }
                                });
                        },
                        function(error) {
                            console.error('AuthentikAuth: Authorization error', error);
                            if (callbacks.onError) {
                                callbacks.onError(error);
                            }
                        },
                        function() {
                            console.log('AuthentikAuth: Device code expired');
                            if (callbacks.onExpired) {
                                callbacks.onExpired();
                            }
                        }
                    );
                })
                .catch(function(error) {
                    console.error('AuthentikAuth: Device flow failed', error);
                    if (callbacks.onError) {
                        callbacks.onError(error);
                    }
                });
        },

        /**
         * Get current user code (if device flow is active)
         */
        getUserCode: function() {
            return this._userCode;
        },

        /**
         * Get verification URI
         */
        getVerificationUri: function() {
            return this._verificationUri;
        },

        /**
         * Check if device flow is active
         */
        isFlowActive: function() {
            return this._deviceCode !== null && Date.now() < this._expiresAt;
        }
    };

    // Export to global scope
    window.AuthentikAuth = AuthentikAuth;

})(window);
