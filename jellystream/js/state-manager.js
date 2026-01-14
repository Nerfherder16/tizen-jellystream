/**
 * JellyStream State Manager
 * Centralized state management for the entire application
 */
(function(window) {
    'use strict';

    var StateManager = {
        // Authentication state
        jellyfin: {
            connected: false,
            serverUrl: null,
            userId: null,
            userName: null,
            accessToken: null,
            deviceId: null,
            serverId: null
        },

        jellyseerr: {
            connected: false,
            serverUrl: null,
            apiKey: null
        },

        // UI state
        ui: {
            currentScreen: 'splash',
            previousScreen: null,
            currentTab: 'discover',
            focusedRow: 0,
            focusedCard: 0,
            isModalOpen: false,
            modalType: null
        },

        // Data cache
        cache: {
            trendingMedia: [],
            popularMovies: [],
            popularTv: [],
            upcomingMovies: [],
            upcomingTv: [],
            libraries: [],
            continueWatching: [],
            requests: [],
            searchResults: []
        },

        // Playback state
        playback: {
            isPlaying: false,
            currentMediaId: null,
            currentMediaType: null,
            currentPosition: 0,
            duration: 0,
            isPaused: false
        },

        // User preferences
        settings: {
            theme: 'dark',
            autoPlayNext: true,
            preferredQuality: 'auto',
            subtitlesEnabled: false,
            defaultSubtitleLanguage: 'en'
        },

        /**
         * Initialize state manager - load from storage
         */
        init: function() {
            console.log('StateManager: Initializing');
            this.loadFromStorage();
            console.log('StateManager: State loaded from storage');
        },

        /**
         * Load state from localStorage
         */
        loadFromStorage: function() {
            try {
                var stored = localStorage.getItem('jellystream_state');
                if (stored) {
                    var parsed = JSON.parse(stored);

                    // Restore authentication
                    if (parsed.jellyfin) {
                        this.jellyfin = parsed.jellyfin;
                    }
                    if (parsed.jellyseerr) {
                        this.jellyseerr = parsed.jellyseerr;
                    }

                    // Restore settings
                    if (parsed.settings) {
                        this.settings = parsed.settings;
                    }

                    // Don't restore cache or UI state - those are session-specific
                }
            } catch (e) {
                console.error('StateManager: Failed to load state from storage', e);
            }
        },

        /**
         * Save state to localStorage
         */
        saveToStorage: function() {
            try {
                var toSave = {
                    jellyfin: this.jellyfin,
                    jellyseerr: this.jellyseerr,
                    settings: this.settings
                };
                localStorage.setItem('jellystream_state', JSON.stringify(toSave));
            } catch (e) {
                console.error('StateManager: Failed to save state to storage', e);
            }
        },

        /**
         * Set Jellyfin authentication
         */
        setJellyfinAuth: function(serverUrl, userId, userName, accessToken, deviceId, serverId) {
            this.jellyfin.serverUrl = serverUrl;
            this.jellyfin.userId = userId;
            this.jellyfin.userName = userName;
            this.jellyfin.accessToken = accessToken;
            this.jellyfin.deviceId = deviceId;
            this.jellyfin.serverId = serverId;
            this.jellyfin.connected = true;
            this.saveToStorage();
            console.log('StateManager: Jellyfin auth saved');
        },

        /**
         * Set Jellyseerr authentication
         */
        setJellyseerrAuth: function(serverUrl, apiKey) {
            this.jellyseerr.serverUrl = serverUrl;
            this.jellyseerr.apiKey = apiKey;
            this.jellyseerr.connected = true;
            this.saveToStorage();
            console.log('StateManager: Jellyseerr auth saved');
        },

        /**
         * Clear authentication (logout)
         */
        clearAuth: function() {
            this.jellyfin.connected = false;
            this.jellyfin.accessToken = null;
            this.jellyfin.userId = null;
            this.jellyfin.userName = null;
            this.jellyfin.serverUrl = null;
            this.jellyfin.deviceId = null;
            this.jellyfin.serverId = null;
            this.jellyseerr.connected = false;
            this.jellyseerr.serverUrl = null;
            this.jellyseerr.apiKey = null;
            this.saveToStorage();
            console.log('StateManager: Auth cleared completely');
        },

        /**
         * Full reset - clear everything including localStorage
         */
        fullReset: function() {
            localStorage.removeItem('jellystream_state');
            console.log('StateManager: Full reset - localStorage cleared');
            // Reload page to start fresh
            location.reload();
        },

        /**
         * Update UI state
         */
        setScreen: function(screenName) {
            this.ui.previousScreen = this.ui.currentScreen;
            this.ui.currentScreen = screenName;
            console.log('StateManager: Screen changed to ' + screenName);
        },

        /**
         * Set current tab
         */
        setTab: function(tabName) {
            this.ui.currentTab = tabName;
        },

        /**
         * Update focus position
         */
        setFocus: function(rowIndex, cardIndex) {
            this.ui.focusedRow = rowIndex;
            this.ui.focusedCard = cardIndex;
        },

        /**
         * Cache trending media
         */
        cacheTrending: function(items) {
            this.cache.trendingMedia = items;
        },

        /**
         * Cache popular movies
         */
        cachePopularMovies: function(items) {
            this.cache.popularMovies = items;
        },

        /**
         * Cache popular TV shows
         */
        cachePopularTv: function(items) {
            this.cache.popularTv = items;
        },

        /**
         * Cache continue watching
         */
        cacheContinueWatching: function(items) {
            this.cache.continueWatching = items;
        },

        /**
         * Cache requests
         */
        cacheRequests: function(items) {
            this.cache.requests = items;
        },

        /**
         * Update playback state
         */
        setPlaybackState: function(mediaId, mediaType, position, duration) {
            this.playback.isPlaying = true;
            this.playback.currentMediaId = mediaId;
            this.playback.currentMediaType = mediaType;
            this.playback.currentPosition = position;
            this.playback.duration = duration;
        },

        /**
         * Clear playback state
         */
        clearPlaybackState: function() {
            this.playback.isPlaying = false;
            this.playback.currentMediaId = null;
            this.playback.currentMediaType = null;
            this.playback.currentPosition = 0;
            this.playback.duration = 0;
            this.playback.isPaused = false;
        },

        /**
         * Update settings
         */
        updateSettings: function(newSettings) {
            for (var key in newSettings) {
                if (newSettings.hasOwnProperty(key)) {
                    this.settings[key] = newSettings[key];
                }
            }
            this.saveToStorage();
        },

        /**
         * Check if authenticated to both services
         */
        isFullyAuthenticated: function() {
            return this.jellyfin.connected && this.jellyseerr.connected;
        },

        /**
         * Get current state snapshot
         */
        getState: function() {
            return {
                jellyfin: this.jellyfin,
                jellyseerr: this.jellyseerr,
                ui: this.ui,
                cache: this.cache,
                playback: this.playback,
                settings: this.settings
            };
        }
    };

    // Export to global scope
    window.StateManager = StateManager;

})(window);
