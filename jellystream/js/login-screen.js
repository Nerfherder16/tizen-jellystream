/**
 * JellyStream - Login Screen
 * Handles Jellyfin and Jellyseerr authentication
 */
(function(window, document) {
    'use strict';

    var LoginScreen = {
        initialized: false,
        quickConnectSecret: null,
        quickConnectPollInterval: null,
        deviceCodeTimerInterval: null,
        deviceCodeExpiresAt: null,

        /**
         * Initialize login screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('LoginScreen: Initializing');

            // Bind event listeners
            this.bindEvents();

            // Load saved server URLs if available
            this.loadSavedServers();

            this.initialized = true;
        },

        /**
         * Load login screen
         */
        load: function() {
            console.log('LoginScreen: Loading');

            // Clear any corrupted auth state when we reach login
            if (window.StateManager) {
                window.StateManager.clearAuth();
            }

            // Reset forms
            this.resetForms();

            // Ensure focus is set on the main login button
            var ssoBtn = document.getElementById('start-sso-btn');
            if (ssoBtn && window.FocusManager) {
                setTimeout(function() {
                    window.FocusManager.setFocus(ssoBtn);
                }, 100);
            }

            console.log('LoginScreen: Loaded');
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            var self = this;

            // SSO Login button (Device Code Flow)
            var ssoBtn = document.getElementById('start-sso-btn');
            if (ssoBtn) {
                ssoBtn.addEventListener('click', function() {
                    self.handleSSOLogin();
                });
            }

            // Cancel device code button
            var cancelDeviceCodeBtn = document.getElementById('cancel-device-code-btn');
            if (cancelDeviceCodeBtn) {
                cancelDeviceCodeBtn.addEventListener('click', function() {
                    self.cancelDeviceCodeFlow();
                });
            }

            // Jellyfin login button (manual)
            var jellyfinBtn = document.getElementById('login-jellyfin-btn');
            if (jellyfinBtn) {
                jellyfinBtn.addEventListener('click', function() {
                    self.handleJellyfinLogin();
                });
            }

            // Jellyseerr login button
            var jellyseerrBtn = document.getElementById('login-jellyseerr-btn');
            if (jellyseerrBtn) {
                jellyseerrBtn.addEventListener('click', function() {
                    self.handleJellyseerrLogin();
                });
            }

            // Enter key support on password field
            var passwordInput = document.getElementById('jellyfin-password');
            if (passwordInput) {
                passwordInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        self.handleJellyfinLogin();
                    }
                });
            }

            // Enter key support
            var inputs = document.querySelectorAll('#login-screen input');
            for (var i = 0; i < inputs.length; i++) {
                inputs[i].addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        if (this.id.includes('jellyfin')) {
                            self.handleJellyfinLogin();
                        } else if (this.id.includes('jellyseerr')) {
                            self.handleJellyseerrLogin();
                        }
                    }
                });
            }
        },

        /**
         * Load saved server URLs from state
         */
        loadSavedServers: function() {
            if (!window.StateManager) return;

            var jellyfinUrl = window.StateManager.jellyfin.serverUrl;
            var jellyseerrUrl = window.StateManager.jellyseerr.serverUrl;

            if (jellyfinUrl) {
                var jellyfinInput = document.getElementById('jellyfin-server');
                if (jellyfinInput) jellyfinInput.value = jellyfinUrl;
            }

            if (jellyseerrUrl) {
                var jellyseerrInput = document.getElementById('jellyseerr-server');
                if (jellyseerrInput) jellyseerrInput.value = jellyseerrUrl;
            }
        },

        /**
         * Reset forms
         */
        resetForms: function() {
            // Hide Jellyseerr form initially
            var jellyseerrForm = document.getElementById('jellyseerr-form');
            if (jellyseerrForm) jellyseerrForm.style.display = 'none';

            // Hide web login panel
            var webPanel = document.getElementById('jellyfin-web-panel');
            if (webPanel) webPanel.style.display = 'none';
        },


        /**
         * Handle Jellyfin login with access token
         */
        handleJellyfinLogin: function() {
            console.log('LoginScreen: Jellyfin login');

            var serverInput = document.getElementById('jellyfin-server');
            var tokenInput = document.getElementById('jellyfin-access-token');
            var userIdInput = document.getElementById('jellyfin-user-id');

            var serverUrl = serverInput ? serverInput.value.trim() : '';
            var accessToken = tokenInput ? tokenInput.value.trim() : '';
            var userId = userIdInput ? userIdInput.value.trim() : '';

            if (!serverUrl || !accessToken || !userId) {
                alert('Please fill in all fields');
                return;
            }

            // Add https:// if no protocol
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                serverUrl = 'https://' + serverUrl;
            }

            this.showLoading('Connecting to Jellyfin...');

            // Initialize client
            window.JellyfinClient.init(
                serverUrl,
                userId,
                accessToken,
                window.JellyfinClient._generateDeviceId(),
                null
            );

            // Test connection by getting user info
            window.JellyfinClient._request('/Users/' + userId)
                .then(function(userResult) {
                    console.log('Jellyfin connected, user:', userResult.Name);

                    // Save to state
                    window.StateManager.setJellyfinAuth(
                        serverUrl,
                        userId,
                        userResult.Name,
                        accessToken,
                        window.JellyfinClient._deviceId,
                        userResult.ServerId || 'unknown'
                    );

                    this.showJellyseerrForm();
                    this.hideLoading();
                }.bind(this))
                .catch(function(error) {
                    console.error('Jellyfin connection failed:', error);
                    this.hideLoading();
                    alert('Failed to connect to Jellyfin: ' + error.message + '\n\nMake sure your token is valid and hasn\'t expired.');
                }.bind(this));
        },

        /**
         * Handle Jellyfin web login (with Authentik SSO)
         */
        handleJellyfinWebLogin: function() {
            console.log('LoginScreen: Opening Jellyfin web login');

            var serverInput = document.getElementById('jellyfin-server');
            var serverUrl = serverInput ? serverInput.value.trim() : '';

            if (!serverUrl) {
                alert('Please enter Jellyfin server URL');
                return;
            }

            // Add https:// if needed
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                serverUrl = 'https://' + serverUrl;
            }

            // Store server URL for later
            this.jellyfinServerUrl = serverUrl;

            // Open Jellyfin in new window
            var loginUrl = serverUrl + '/web/index.html';
            window.open(loginUrl, 'JellyfinLogin', 'width=1200,height=800');

            // Show completion panel
            var webPanel = document.getElementById('jellyfin-web-panel');
            if (webPanel) webPanel.style.display = 'block';
        },

        /**
         * Complete Jellyfin web login after user has authenticated
         */
        completeJellyfinWebLogin: function() {
            console.log('LoginScreen: Completing web login');

            var credentialsInput = document.getElementById('jellyfin-credentials-input');
            var credentialsJson = credentialsInput ? credentialsInput.value.trim() : '';

            if (!credentialsJson) {
                alert('Please paste your Jellyfin credentials JSON');
                return;
            }

            this.showLoading('Processing credentials...');

            try {
                // Remove quotes if user copied the quoted string
                if (credentialsJson.startsWith('"') && credentialsJson.endsWith('"')) {
                    credentialsJson = credentialsJson.slice(1, -1);
                }

                // Unescape if needed
                credentialsJson = credentialsJson.replace(/\\"/g, '"');

                var creds = JSON.parse(credentialsJson);
                var servers = creds.Servers || [];

                if (servers.length > 0) {
                    var server = servers[0];

                    // Initialize Jellyfin client
                    window.JellyfinClient.init(
                        server.ManualAddress || this.jellyfinServerUrl,
                        server.UserId,
                        server.AccessToken,
                        null,
                        server.Id
                    );

                    // Save to state
                    window.StateManager.setJellyfinAuth(
                        server.ManualAddress || this.jellyfinServerUrl,
                        server.UserId,
                        server.UserName || 'User',
                        server.AccessToken,
                        window.JellyfinClient._deviceId,
                        server.Id
                    );

                    console.log('LoginScreen: Successfully loaded Jellyfin credentials');

                    // Hide web panel
                    this.cancelJellyfinWebLogin();

                    // Show Jellyseerr form
                    this.showJellyseerrForm();
                } else {
                    throw new Error('No Jellyfin servers found in credentials');
                }

                this.hideLoading();
            } catch (error) {
                console.error('LoginScreen: Failed to parse credentials', error);
                this.hideLoading();
                alert('Failed to parse credentials. Make sure you copied the entire JSON string from the console.\n\nError: ' + error.message);
            }
        },

        /**
         * Cancel Jellyfin web login
         */
        cancelJellyfinWebLogin: function() {
            var webPanel = document.getElementById('jellyfin-web-panel');
            if (webPanel) webPanel.style.display = 'none';
        },

        /**
         * Handle Jellyfin API Key login
         */
        handleJellyfinApiKeyLogin: function() {
            console.log('LoginScreen: Attempting Jellyfin API Key login');

            var serverInput = document.getElementById('jellyfin-server');
            var apiKeyInput = document.getElementById('jellyfin-api-key');
            var userIdInput = document.getElementById('jellyfin-user-id');

            var serverUrl = serverInput ? serverInput.value.trim() : '';
            var apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
            var userId = userIdInput ? userIdInput.value.trim() : '';

            if (!serverUrl || !apiKey || !userId) {
                alert('Please enter server URL, API key, and user ID');
                return;
            }

            // Add https:// if no protocol specified
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                serverUrl = 'https://' + serverUrl;
            }

            this.showLoading('Connecting to Jellyfin with API key...');

            // Initialize Jellyfin client with API key
            window.JellyfinClient.initWithApiKey(serverUrl, apiKey, userId);

            // Test connection by getting system info (doesn't require user ID)
            window.JellyfinClient._request('/System/Info')
                .then(function(result) {
                    console.log('LoginScreen: Jellyfin API Key connection successful', result);

                    // Try to get user info
                    return window.JellyfinClient.getItem(userId);
                })
                .then(function(userResult) {
                    console.log('LoginScreen: User info retrieved', userResult);

                    // Save to state
                    window.StateManager.setJellyfinAuth(
                        serverUrl,
                        userId,
                        userResult.Name || 'User',
                        apiKey,
                        window.JellyfinClient._deviceId,
                        window.JellyfinClient._serverId || 'unknown'
                    );

                    // Show Jellyseerr form
                    this.showJellyseerrForm();
                    this.hideLoading();
                }.bind(this))
                .catch(function(error) {
                    console.error('LoginScreen: Jellyfin API Key login failed', error);

                    // More detailed error message
                    var errorMsg = 'Jellyfin connection failed: ' + error.message;

                    if (error.message.includes('Failed to fetch')) {
                        errorMsg += '\n\nThis is likely a CORS issue. Jellyfin API requests are being blocked by Authentik.';
                        errorMsg += '\n\nTo fix this, you need to configure Authentik to allow API key authentication to bypass SSO for the Jellyfin API endpoints.';
                        errorMsg += '\n\nAlternatively, you may need to access Jellyfin directly (not through Authentik proxy).';
                    }

                    alert(errorMsg);
                    this.hideLoading();
                }.bind(this));
        },

        /**
         * Initiate Jellyfin Quick Connect
         */
        initiateQuickConnect: function() {
            console.log('LoginScreen: Initiating Quick Connect');

            var serverInput = document.getElementById('jellyfin-server');
            var serverUrl = serverInput ? serverInput.value.trim() : '';

            if (!serverUrl) {
                alert('Please enter Jellyfin server URL');
                return;
            }

            // Add https:// if no protocol specified
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                serverUrl = 'https://' + serverUrl;
            }

            // Store for later
            this.jellyfinServerUrl = serverUrl;

            this.showLoading('Starting Quick Connect...');

            window.JellyfinClient.initiateQuickConnect(serverUrl)
                .then(function(result) {
                    console.log('LoginScreen: Quick Connect result:', result);

                    if (result.success) {
                        console.log('LoginScreen: Quick Connect initiated, code:', result.code);

                        this.quickConnectSecret = result.secret;

                        // Show Quick Connect panel with code
                        this.showQuickConnectPanel(result.code);

                        // Start polling for authorization
                        this.startQuickConnectPolling(serverUrl, result.secret);
                    } else {
                        console.error('LoginScreen: Quick Connect failed', result.error);
                        alert('Quick Connect failed: ' + result.error);
                    }
                    this.hideLoading();
                }.bind(this))
                .catch(function(error) {
                    console.error('LoginScreen: Quick Connect error', error);
                    alert('Quick Connect error: ' + error.message);
                    this.hideLoading();
                }.bind(this));
        },

        /**
         * Show Quick Connect panel
         */
        showQuickConnectPanel: function(code) {
            var panel = document.getElementById('quick-connect-panel');
            var codeDisplay = document.getElementById('quick-connect-code');

            if (panel) panel.style.display = 'block';
            if (codeDisplay) codeDisplay.textContent = code;
        },

        /**
         * Start polling for Quick Connect approval
         */
        startQuickConnectPolling: function(serverUrl, secret) {
            var self = this;

            console.log('LoginScreen: Starting Quick Connect polling...');

            this.quickConnectPollInterval = setInterval(function() {
                window.JellyfinClient.checkQuickConnect(serverUrl, secret)
                    .then(function(result) {
                        console.log('LoginScreen: Quick Connect poll result:', result);

                        if (result.authenticated) {
                            console.log('LoginScreen: Quick Connect approved!');

                            // Stop polling
                            clearInterval(self.quickConnectPollInterval);
                            self.quickConnectPollInterval = null;

                            // Complete authentication
                            self.completeQuickConnect(serverUrl, secret);
                        }
                    })
                    .catch(function(error) {
                        console.error('LoginScreen: Quick Connect polling error', error);
                    });
            }, 3000); // Poll every 3 seconds

            // Stop polling after 5 minutes
            setTimeout(function() {
                if (self.quickConnectPollInterval) {
                    clearInterval(self.quickConnectPollInterval);
                    self.quickConnectPollInterval = null;
                    self.cancelQuickConnect();
                    alert('Quick Connect timed out. Please try again.');
                }
            }, 300000);
        },

        /**
         * Complete Quick Connect authentication
         */
        completeQuickConnect: function(serverUrl, secret) {
            this.showLoading('Completing authentication...');

            console.log('LoginScreen: Completing Quick Connect with secret:', secret);

            window.JellyfinClient.authorizeQuickConnect(serverUrl, secret)
                .then(function(result) {
                    console.log('LoginScreen: Authorization result:', result);

                    if (result.success) {
                        console.log('LoginScreen: Quick Connect authentication complete');
                        console.log('User:', result.userName, 'ID:', result.userId);

                        // Save to state
                        window.StateManager.setJellyfinAuth(
                            serverUrl,
                            result.userId,
                            result.userName,
                            result.accessToken,
                            window.JellyfinClient._deviceId,
                            result.serverId
                        );

                        // Initialize Jellyfin client with the new credentials
                        window.JellyfinClient.init(
                            serverUrl,
                            result.userId,
                            result.accessToken,
                            window.JellyfinClient._deviceId,
                            result.serverId
                        );

                        // Hide Quick Connect panel
                        this.cancelQuickConnect();

                        // Show Jellyseerr form
                        this.showJellyseerrForm();
                    } else {
                        console.error('LoginScreen: Quick Connect authorization failed', result.error);
                        alert('Quick Connect failed: ' + result.error);
                    }
                    this.hideLoading();
                }.bind(this))
                .catch(function(error) {
                    console.error('LoginScreen: Quick Connect authorization error', error);
                    alert('Quick Connect error: ' + error.message);
                    this.hideLoading();
                }.bind(this));
        },

        /**
         * Cancel Quick Connect
         */
        cancelQuickConnect: function() {
            if (this.quickConnectPollInterval) {
                clearInterval(this.quickConnectPollInterval);
                this.quickConnectPollInterval = null;
            }

            var panel = document.getElementById('quick-connect-panel');
            if (panel) panel.style.display = 'none';

            this.quickConnectSecret = null;
        },

        /**
         * Show Jellyseerr form
         */
        showJellyseerrForm: function() {
            var form = document.getElementById('jellyseerr-form');
            if (form) form.style.display = 'block';

            // Scroll to Jellyseerr form
            if (form) form.scrollIntoView({ behavior: 'smooth' });
        },

        /**
         * Handle Jellyseerr login
         */
        handleJellyseerrLogin: function() {
            console.log('LoginScreen: Attempting Jellyseerr connection');

            var serverInput = document.getElementById('jellyseerr-server');
            var apiKeyInput = document.getElementById('jellyseerr-api-key');

            var serverUrl = serverInput ? serverInput.value.trim() : '';
            var apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

            if (!serverUrl || !apiKey) {
                alert('Please enter Jellyseerr server URL and API key');
                return;
            }

            // Add http:// if no protocol specified
            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
                serverUrl = 'http://' + serverUrl;
            }

            this.showLoading('Connecting to Jellyseerr...');

            // Initialize Jellyseerr client
            window.JellyseerrClient.init(serverUrl, apiKey);

            // Test connection
            window.JellyseerrClient.testConnection()
                .then(function(result) {
                    if (result.success) {
                        console.log('LoginScreen: Jellyseerr connection successful');

                        // Save to state
                        window.StateManager.setJellyseerrAuth(serverUrl, apiKey);

                        // Navigate to home
                        setTimeout(function() {
                            if (window.Router) {
                                window.Router.navigateTo('#/home');
                            }
                        }, 500);
                    } else {
                        console.error('LoginScreen: Jellyseerr connection failed', result.error);
                        alert('Jellyseerr connection failed: ' + result.error);
                    }
                    this.hideLoading();
                }.bind(this))
                .catch(function(error) {
                    console.error('LoginScreen: Jellyseerr connection error', error);
                    alert('Jellyseerr connection error: ' + error.message);
                    this.hideLoading();
                }.bind(this));
        },

        /**
         * Handle Quick Connect Login
         */
        handleSSOLogin: function() {
            var self = this;

            if (!window.QuickConnect) {
                alert('Quick Connect is not available');
                return;
            }

            console.log('LoginScreen: Starting Quick Connect flow');

            // Show device code panel, hide SSO form
            var ssoForm = document.getElementById('sso-login-form');
            var devicePanel = document.getElementById('device-code-panel');

            if (ssoForm) ssoForm.style.display = 'none';
            if (devicePanel) devicePanel.style.display = 'block';

            // Start the Quick Connect flow
            window.QuickConnect.authenticate({
                onCode: function(data) {
                    console.log('LoginScreen: Got Quick Connect code', data.code);

                    // Display the code
                    var codeDisplay = document.getElementById('device-code-display');
                    if (codeDisplay) {
                        codeDisplay.textContent = data.code;
                    }

                    // Update status
                    var status = document.getElementById('device-code-status');
                    if (status) {
                        status.textContent = 'Waiting for approval...';
                        status.style.color = '#888';
                    }
                },

                onAuthorized: function(session) {
                    console.log('LoginScreen: Quick Connect authorized', session);
                    console.log('LoginScreen: UserId:', session.userId, 'Token:', session.accessToken ? 'present' : 'missing');

                    // Save to state
                    window.StateManager.setJellyfinAuth(
                        'https://jellyfin.streamy.tube',
                        session.userId,
                        session.userName,
                        session.accessToken,
                        window.JellyfinClient._generateDeviceId(),
                        session.serverId
                    );

                    // Initialize Jellyfin client
                    window.JellyfinClient.init(
                        'https://jellyfin.streamy.tube',
                        session.userId,
                        session.accessToken,
                        window.JellyfinClient._generateDeviceId(),
                        session.serverId
                    );

                    // Update status
                    var status = document.getElementById('device-code-status');
                    if (status) {
                        status.textContent = 'Connected!';
                        status.style.color = 'var(--color-primary)';
                    }

                    // Show Jellyseerr form after a short delay
                    setTimeout(function() {
                        self.cancelDeviceCodeFlow();
                        self.showJellyseerrForm();
                    }, 1000);
                },

                onError: function(error) {
                    console.error('LoginScreen: Quick Connect error', error);

                    var status = document.getElementById('device-code-status');
                    if (status) {
                        status.textContent = 'Error: ' + error.message;
                        status.style.color = '#ff4444';
                    }

                    // Show retry option after a moment
                    setTimeout(function() {
                        self.cancelDeviceCodeFlow();
                        alert('Quick Connect failed: ' + error.message + '\n\nPlease try again or use manual login.');
                    }, 2000);
                }
            });
        },

        /**
         * Cancel device code flow and return to login form
         */
        cancelDeviceCodeFlow: function() {
            console.log('LoginScreen: Cancelling device code flow');

            // Stop polling
            if (window.QuickConnect) {
                window.QuickConnect.stopPolling();
            }

            // Stop timer (if any)
            this.stopDeviceCodeTimer();

            // Hide device panel, show SSO form
            var ssoForm = document.getElementById('sso-login-form');
            var devicePanel = document.getElementById('device-code-panel');

            if (devicePanel) devicePanel.style.display = 'none';
            if (ssoForm) ssoForm.style.display = 'block';

            // Reset display
            var codeDisplay = document.getElementById('device-code-display');
            if (codeDisplay) codeDisplay.textContent = '------';

            var status = document.getElementById('device-code-status');
            if (status) {
                status.textContent = 'Waiting for approval...';
                status.style.color = '#888';
            }
        },

        /**
         * Start device code countdown timer
         */
        startDeviceCodeTimer: function() {
            var self = this;

            this.stopDeviceCodeTimer();

            var timerDisplay = document.getElementById('device-code-timer');

            this.deviceCodeTimerInterval = setInterval(function() {
                var remaining = self.deviceCodeExpiresAt - Date.now();

                if (remaining <= 0) {
                    self.stopDeviceCodeTimer();
                    if (timerDisplay) timerDisplay.textContent = '0:00';
                    return;
                }

                var minutes = Math.floor(remaining / 60000);
                var seconds = Math.floor((remaining % 60000) / 1000);

                if (timerDisplay) {
                    timerDisplay.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
                }
            }, 1000);
        },

        /**
         * Stop device code countdown timer
         */
        stopDeviceCodeTimer: function() {
            if (this.deviceCodeTimerInterval) {
                clearInterval(this.deviceCodeTimerInterval);
                this.deviceCodeTimerInterval = null;
            }
        },

        /**
         * Show loading indicator
         */
        showLoading: function(message) {
            var indicator = document.getElementById('loading-indicator');
            if (indicator) {
                indicator.classList.remove('hidden');
            }
            console.log('Loading: ' + message);
        },

        /**
         * Hide loading indicator
         */
        hideLoading: function() {
            var indicator = document.getElementById('loading-indicator');
            if (indicator) {
                indicator.classList.add('hidden');
            }
        }
    };

    // Export to global scope
    window.LoginScreen = LoginScreen;

})(window, document);
