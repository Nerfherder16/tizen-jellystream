/**
 * JellyStream - Jellyfin Quick Connect Authentication
 * Built-in Jellyfin feature for TV/device authentication
 */
(function(window) {
    'use strict';

    var QuickConnect = {
        // Configuration
        config: {
            // Direct URL works - no CORS issues with Jellyfin
            baseUrl: 'https://jellyfin.streamy.tube',
            clientName: 'JellyStream',
            deviceName: 'Tizen TV',
            deviceId: null,
            version: '1.0.0'
        },

        // Current Quick Connect session
        _secret: null,
        _code: null,
        _pollInterval: null,
        _pollIntervalMs: 3000, // Poll every 3 seconds

        /**
         * Generate device ID if not exists
         */
        _getDeviceId: function() {
            if (!this.config.deviceId) {
                var stored = localStorage.getItem('jellystream_device_id');
                if (stored) {
                    this.config.deviceId = stored;
                } else {
                    this.config.deviceId = 'jellystream_' + Math.random().toString(36).substring(2, 15);
                    localStorage.setItem('jellystream_device_id', this.config.deviceId);
                }
            }
            return this.config.deviceId;
        },

        /**
         * Build authorization header for Jellyfin API
         */
        _getAuthHeader: function() {
            var parts = [
                'MediaBrowser Client="' + this.config.clientName + '"',
                'Device="' + this.config.deviceName + '"',
                'DeviceId="' + this._getDeviceId() + '"',
                'Version="' + this.config.version + '"'
            ];
            return parts.join(', ');
        },

        /**
         * Check if Quick Connect is enabled on the server
         * @returns {Promise} Resolves with boolean
         */
        isEnabled: function() {
            return fetch(this.config.baseUrl + '/QuickConnect/Enabled')
                .then(function(response) {
                    if (response.ok) {
                        return response.json();
                    }
                    return false;
                })
                .catch(function() {
                    return false;
                });
        },

        /**
         * Initiate Quick Connect flow
         * @returns {Promise} Resolves with {code, secret}
         */
        initiate: function() {
            var self = this;

            console.log('QuickConnect: Initiating Quick Connect');

            return fetch(this.config.baseUrl + '/QuickConnect/Initiate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Emby-Authorization': this._getAuthHeader()
                }
            })
            .then(function(response) {
                if (!response.ok) {
                    return response.text().then(function(text) {
                        throw new Error('Quick Connect initiation failed: ' + response.status + ' - ' + text);
                    });
                }
                return response.json();
            })
            .then(function(data) {
                console.log('QuickConnect: Got code', data.Code);

                self._secret = data.Secret;
                self._code = data.Code;

                return {
                    code: data.Code,
                    secret: data.Secret
                };
            });
        },

        /**
         * Poll for authorization
         * @param {Function} onAuthorized - Called when user authorizes with {accessToken, userId}
         * @param {Function} onError - Called on error
         */
        pollForAuthorization: function(onAuthorized, onError) {
            var self = this;

            if (!this._secret) {
                onError(new Error('No Quick Connect session. Call initiate first.'));
                return;
            }

            console.log('QuickConnect: Starting authorization polling');

            this._pollInterval = setInterval(function() {
                self._checkAuthorization()
                    .then(function(result) {
                        if (result.authenticated) {
                            self.stopPolling();
                            onAuthorized(result);
                        }
                        // If not authenticated yet, continue polling
                    })
                    .catch(function(error) {
                        console.error('QuickConnect: Poll error', error);
                        // Don't stop on temporary errors, just log
                    });
            }, this._pollIntervalMs);
        },

        /**
         * Check if authorization is complete
         * @returns {Promise} Resolves with {authenticated: boolean, accessToken?, userId?}
         */
        _checkAuthorization: function() {
            var self = this;

            return fetch(this.config.baseUrl + '/QuickConnect/Connect?secret=' + encodeURIComponent(this._secret))
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Quick Connect check failed: ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (data.Authenticated) {
                        console.log('QuickConnect: Quick Connect approved, exchanging for token...');
                        // Now exchange the secret for an actual access token
                        return self._authenticateWithQuickConnect();
                    }
                    return { authenticated: false };
                });
        },

        /**
         * Exchange Quick Connect secret for access token
         * @returns {Promise} Resolves with {authenticated, accessToken, userId, userName, serverId}
         */
        _authenticateWithQuickConnect: function() {
            var self = this;

            return fetch(this.config.baseUrl + '/Users/AuthenticateWithQuickConnect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Emby-Authorization': this._getAuthHeader()
                },
                body: JSON.stringify({ Secret: this._secret })
            })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Quick Connect authentication failed: ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                console.log('QuickConnect: Got access token for user', data.User.Name);
                return {
                    authenticated: true,
                    accessToken: data.AccessToken,
                    userId: data.User.Id,
                    userName: data.User.Name,
                    serverId: data.ServerId
                };
            });
        },

        /**
         * Stop polling
         */
        stopPolling: function() {
            if (this._pollInterval) {
                clearInterval(this._pollInterval);
                this._pollInterval = null;
            }
            this._secret = null;
            this._code = null;
        },

        /**
         * Get current code
         */
        getCode: function() {
            return this._code;
        },

        /**
         * Check if Quick Connect flow is active
         */
        isFlowActive: function() {
            return this._secret !== null;
        },

        /**
         * Complete authentication flow
         * @param {Object} callbacks - {onCode, onAuthorized, onError}
         */
        authenticate: function(callbacks) {
            var self = this;

            callbacks = callbacks || {};

            // First check if Quick Connect is enabled
            this.isEnabled()
                .then(function(enabled) {
                    if (!enabled) {
                        throw new Error('Quick Connect is not enabled on this Jellyfin server. Please enable it in Dashboard > Networking.');
                    }

                    return self.initiate();
                })
                .then(function(data) {
                    // Notify caller of the code
                    if (callbacks.onCode) {
                        callbacks.onCode(data);
                    }

                    // Start polling
                    self.pollForAuthorization(
                        function(result) {
                            if (callbacks.onAuthorized) {
                                callbacks.onAuthorized({
                                    success: true,
                                    userId: result.userId,
                                    userName: result.userName,
                                    accessToken: result.accessToken,
                                    serverId: result.serverId
                                });
                            }
                        },
                        function(error) {
                            console.error('QuickConnect: Authorization error', error);
                            if (callbacks.onError) {
                                callbacks.onError(error);
                            }
                        }
                    );
                })
                .catch(function(error) {
                    console.error('QuickConnect: Flow failed', error);
                    if (callbacks.onError) {
                        callbacks.onError(error);
                    }
                });
        }
    };

    // Export to global scope
    window.QuickConnect = QuickConnect;

})(window);
