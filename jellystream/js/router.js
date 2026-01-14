/**
 * JellyStream Router
 * Hash-based routing for screen navigation
 */
(function(window) {
    'use strict';

    var Router = {
        routes: {
            '#/splash': 'splash-screen',
            '#/login': 'login-screen',
            '#/home': 'home-screen',
            '#/discover': 'discover-screen',
            '#/library': 'library-screen',
            '#/search': 'search-screen',
            '#/settings': 'settings-screen',
            '#/player': 'player-screen'
        },

        currentScreenId: null,
        history: [],

        /**
         * Initialize router
         */
        init: function() {
            console.log('Router: Initializing');

            var self = this;

            // Listen for hash changes
            window.addEventListener('hashchange', function() {
                self.navigate();
            });

            // Initialize nav bar
            this.initNavBar();

            // Always start at splash screen (it will handle routing)
            this.navigateTo('#/splash');

            console.log('Router: Initialized');
        },

        /**
         * Navigate to a route
         */
        navigateTo: function(hash) {
            if (location.hash !== hash) {
                location.hash = hash;
            } else {
                // Already on this hash, trigger navigation manually
                this.navigate();
            }
        },

        /**
         * Handle navigation based on current hash
         */
        navigate: function() {
            var hash = location.hash || '#/splash';
            var screenId = this.routes[hash];

            console.log('Router: Navigating to ' + hash);

            if (screenId) {
                this.showScreen(screenId);
            } else {
                console.error('Router: No route found for ' + hash);
                // Fallback to home
                this.navigateTo('#/home');
            }
        },

        /**
         * Show a screen by ID
         */
        showScreen: function(screenId) {
            console.log('Router: Showing screen ' + screenId);

            // Update state
            if (window.StateManager) {
                window.StateManager.setScreen(screenId);
            }

            // Hide all screens
            var screens = document.querySelectorAll('.screen');
            for (var i = 0; i < screens.length; i++) {
                screens[i].classList.add('hidden');
                screens[i].classList.remove('active');
            }

            // Show target screen
            var screen = document.getElementById(screenId);
            if (screen) {
                screen.classList.remove('hidden');
                screen.classList.add('active');

                // Add to history
                if (this.currentScreenId !== screenId) {
                    this.history.push(this.currentScreenId);
                    // Limit history to 10 items
                    if (this.history.length > 10) {
                        this.history.shift();
                    }
                }

                this.currentScreenId = screenId;

                // Initialize screen if has init method
                var screenModule = this.getScreenModule(screenId);
                if (screenModule && screenModule.init) {
                    screenModule.init();
                }

                // Load screen data if has load method
                if (screenModule && screenModule.load) {
                    screenModule.load();
                }

                // Update nav bar
                this.updateNavBar(screenId);
            } else {
                console.error('Router: Screen element not found: ' + screenId);
            }
        },

        /**
         * Get screen module by ID
         */
        getScreenModule: function(screenId) {
            // Special case: SplashScreen is reserved on Tizen, use AppSplashScreen
            if (screenId === 'splash-screen') {
                return window.AppSplashScreen;
            }

            // Convert screen-id to ScreenId format
            var moduleName = screenId
                .split('-')
                .map(function(word) {
                    return word.charAt(0).toUpperCase() + word.slice(1);
                })
                .join('');

            return window[moduleName];
        },

        /**
         * Go back to previous screen
         */
        goBack: function() {
            if (this.history.length > 0) {
                var previousScreenId = this.history.pop();

                // Find hash for this screen ID
                var previousHash = null;
                for (var hash in this.routes) {
                    if (this.routes[hash] === previousScreenId) {
                        previousHash = hash;
                        break;
                    }
                }

                if (previousHash) {
                    // Don't add to history when going back
                    var tempHistory = this.history.slice();
                    this.navigateTo(previousHash);
                    this.history = tempHistory;
                } else {
                    // Fallback to home
                    this.navigateTo('#/home');
                }
            } else {
                // No history, go to home
                this.navigateTo('#/home');
            }
        },

        /**
         * Navigate to home
         */
        goHome: function() {
            this.navigateTo('#/home');
        },

        /**
         * Navigate to login
         */
        goToLogin: function() {
            this.navigateTo('#/login');
        },

        /**
         * Navigate to player with media info
         */
        playMedia: function(mediaId, mediaType, source) {
            // Store media info in state
            if (window.StateManager) {
                window.StateManager.playback.currentMediaId = mediaId;
                window.StateManager.playback.currentMediaType = mediaType;
                window.StateManager.playback.source = source; // 'jellyfin' or 'jellyseerr'
            }

            this.navigateTo('#/player');
        },

        /**
         * Navigate to details screen
         */
        showDetails: function(mediaId, mediaType, source) {
            // Store in state for details screen to read
            if (window.StateManager) {
                window.StateManager.ui.detailsMediaId = mediaId;
                window.StateManager.ui.detailsMediaType = mediaType;
                window.StateManager.ui.detailsSource = source;
            }

            // Details is shown as modal, not a route
            if (window.ModalManager) {
                window.ModalManager.showDetails(mediaId, mediaType, source);
            }
        },

        /**
         * Initialize navigation bar
         */
        initNavBar: function() {
            var self = this;
            var navBar = document.getElementById('nav-bar');
            if (!navBar) return;

            var navItems = navBar.querySelectorAll('.nav-item');
            navItems.forEach(function(item) {
                item.addEventListener('click', function() {
                    var screen = this.dataset.screen;
                    self.navigateTo('#/' + screen);
                });
            });
        },

        /**
         * Update navigation bar active state
         */
        updateNavBar: function(screenId) {
            var navBar = document.getElementById('nav-bar');
            if (!navBar) return;

            // Show nav bar only on main screens
            var mainScreens = ['home-screen', 'library-screen', 'search-screen', 'settings-screen', 'discover-screen'];
            navBar.style.display = mainScreens.indexOf(screenId) !== -1 ? 'flex' : 'none';

            // Update active state
            var screenName = screenId.replace('-screen', '');
            var navItems = navBar.querySelectorAll('.nav-item');
            navItems.forEach(function(item) {
                item.classList.remove('active');
                if (item.dataset.screen === screenName) {
                    item.classList.add('active');
                }
            });
        }
    };

    // Export to global scope
    window.Router = Router;

})(window);
