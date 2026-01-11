/**
 * JellyStream - Full Overlay Home Screen (Option 2)
 * Complete overlay that sits on top of Jellyfin
 * Toggle with BLUE button
 */
(function(window) {
    'use strict';

    // Debug mode - set to true to show on-screen debug panel
    var DEBUG_ENABLED = false;

    // Key codes for Samsung TV remote
    var KEY_CODES = {
        BACK: 10009,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ENTER: 13,
        RED: 403,
        GREEN: 404,
        YELLOW: 405,
        BLUE: 406
    };

    // Tab definitions
    var TABS = ['discover', 'movies', 'tv', 'requests'];

    var JellyStreamHome = {
        isVisible: false,
        currentTabIndex: 0,
        currentCardIndex: 0,
        currentRowIndex: 0,
        isModalOpen: false,
        focusArea: 'content', // 'nav' or 'content'
        rows: [], // Cache of current tab's rows
        cards: [], // Cache of current row's cards

        /**
         * Initialize JellyStream overlay
         */
        init: function() {
            console.log('JellyStreamHome: Initializing Option 2 Full Overlay');

            // Initialize config
            if (window.JellyStreamConfig) {
                window.JellyStreamConfig.init();
            }

            // Initialize Jellyseerr API
            this.initAPI();

            // Create the overlay structure
            this.createOverlay();

            // Set up key handlers
            this.setupKeyHandlers();

            // Register Tizen keys
            this.registerTizenKeys();

            // Show JellyStream by default on home
            var self = this;
            setTimeout(function() {
                self.show();
            }, 1500);

            console.log('JellyStreamHome: Initialization complete');
        },

        /**
         * Initialize Jellyseerr API
         */
        initAPI: function() {
            if (window.JellyseerrAPI && window.JellyStreamConfig) {
                var config = window.JellyStreamConfig.getJellyseerrConfig();
                if (config.serverUrl && config.apiKey) {
                    window.JellyseerrAPI.init(config.serverUrl, config.apiKey);
                    console.log('JellyStreamHome: API initialized');
                }
            }
        },

        /**
         * Register Tizen TV remote keys
         */
        registerTizenKeys: function() {
            try {
                if (window.tizen && window.tizen.tvinputdevice) {
                    var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
                                'MediaFastForward', 'MediaRewind', 'ColorF0Red', 'ColorF1Green',
                                'ColorF2Yellow', 'ColorF3Blue'];
                    for (var i = 0; i < keys.length; i++) {
                        try {
                            window.tizen.tvinputdevice.registerKey(keys[i]);
                        } catch (e) {
                            // Key may already be registered
                        }
                    }
                    console.log('JellyStreamHome: Tizen keys registered');
                }
            } catch (e) {
                console.log('JellyStreamHome: Not running on Tizen');
            }
        },

        /**
         * Create the main overlay structure
         */
        createOverlay: function() {
            var existing = document.getElementById('jellystream-app');
            if (existing) {
                existing.remove();
            }

            var app = document.createElement('div');
            app.id = 'jellystream-app';
            app.className = 'hidden';
            app.innerHTML = this.buildOverlayHTML();
            document.body.appendChild(app);

            // Create on-screen debug panel (only if debug enabled)
            if (DEBUG_ENABLED) {
                var debugPanel = document.createElement('div');
                debugPanel.id = 'js-debug';
                debugPanel.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.8);color:#0f0;font-family:monospace;font-size:14px;padding:10px;z-index:99999;max-width:400px;max-height:200px;overflow:hidden;border:1px solid #0f0;';
                document.body.appendChild(debugPanel);
            }

            this.setupTabHandlers();
            console.log('JellyStreamHome: Overlay created');
        },

        /**
         * Log to on-screen debug panel (only if DEBUG_ENABLED)
         */
        debug: function(msg) {
            if (!DEBUG_ENABLED) return;
            var panel = document.getElementById('js-debug');
            if (panel) {
                var line = document.createElement('div');
                line.textContent = msg;
                panel.insertBefore(line, panel.firstChild);
                // Keep only last 10 lines
                while (panel.children.length > 10) {
                    panel.removeChild(panel.lastChild);
                }
            }
            console.log('[JS]', msg);
        },

        /**
         * Build the overlay HTML structure
         */
        buildOverlayHTML: function() {
            var html = '';

            // Header
            html += '<header class="js-header">';
            html += '<div class="js-logo">JellyStream</div>';
            html += '<nav class="js-nav">';
            html += '<button class="js-nav-tab active" data-tab="0">Discover</button>';
            html += '<button class="js-nav-tab" data-tab="1">Movies</button>';
            html += '<button class="js-nav-tab" data-tab="2">TV Shows</button>';
            html += '<button class="js-nav-tab" data-tab="3">My Requests</button>';
            html += '</nav>';
            html += '<div class="js-header-actions">';
            html += '<button class="js-search-btn">Search</button>';
            html += '</div>';
            html += '</header>';

            // Main content area
            html += '<main class="js-main">';

            // Discover tab
            html += '<div id="tab-discover" class="js-tab-content active">';
            html += '<section class="js-section"><h2 class="js-section-title">Trending Now</h2>';
            html += '<div class="js-card-row" id="trending-row"></div></section>';
            html += '<section class="js-section"><h2 class="js-section-title">Popular Movies</h2>';
            html += '<div class="js-card-row" id="popular-movies-row"></div></section>';
            html += '<section class="js-section"><h2 class="js-section-title">Popular TV Shows</h2>';
            html += '<div class="js-card-row" id="popular-tv-row"></div></section>';
            html += '<section class="js-section"><h2 class="js-section-title">Upcoming Movies</h2>';
            html += '<div class="js-card-row" id="upcoming-movies-row"></div></section>';
            html += '<section class="js-section"><h2 class="js-section-title">Upcoming TV Shows</h2>';
            html += '<div class="js-card-row" id="upcoming-tv-row"></div></section>';
            html += '</div>';

            // Movies tab
            html += '<div id="tab-movies" class="js-tab-content">';
            html += '<section class="js-section"><h2 class="js-section-title">Browse by Genre</h2>';
            html += '<div class="js-card-row" id="movie-genres"></div></section>';
            html += '<section class="js-section"><h2 class="js-section-title">All Movies</h2>';
            html += '<div class="js-card-row" id="all-movies-row"></div></section>';
            html += '</div>';

            // TV tab
            html += '<div id="tab-tv" class="js-tab-content">';
            html += '<section class="js-section"><h2 class="js-section-title">Browse by Genre</h2>';
            html += '<div class="js-card-row" id="tv-genres"></div></section>';
            html += '<section class="js-section"><h2 class="js-section-title">All TV Shows</h2>';
            html += '<div class="js-card-row" id="all-tv-row"></div></section>';
            html += '</div>';

            // Requests tab
            html += '<div id="tab-requests" class="js-tab-content">';
            html += '<section class="js-section"><h2 class="js-section-title">My Requests</h2>';
            html += '<div class="js-card-row" id="my-requests-row"></div></section>';
            html += '</div>';

            html += '</main>';

            // Footer
            html += '<footer class="js-footer">';
            html += '<div class="js-footer-hint">';
            html += '<span><span class="js-key blue">BLUE</span> Jellyfin</span>';
            html += '<span><span class="js-key green">GREEN</span> Request</span>';
            html += '<span><span class="js-key yellow">YELLOW</span> Info</span>';
            html += '<span><span class="js-key red">RED</span> Settings</span>';
            html += '</div>';
            html += '</footer>';

            // Details Modal - Jellyseerr iframe embed
            html += '<div id="js-modal" class="js-modal hidden">';
            html += '<div class="js-modal-iframe-container">';
            html += '<div class="js-modal-header">';
            html += '<span id="modal-title-bar" class="js-modal-title-bar">Loading...</span>';
            html += '<button id="modal-close-btn" class="js-modal-close-x">&times;</button>';
            html += '</div>';
            html += '<iframe id="js-modal-iframe" class="js-modal-iframe" src="" frameborder="0" allowfullscreen></iframe>';
            html += '<div class="js-modal-footer">';
            html += '<span class="js-modal-hint">Press <span class="js-key blue">BACK</span> to close</span>';
            html += '</div>';
            html += '</div>';
            html += '</div>';

            return html;
        },

        /**
         * Set up tab click handlers
         */
        setupTabHandlers: function() {
            var self = this;
            var tabs = document.querySelectorAll('.js-nav-tab');

            for (var i = 0; i < tabs.length; i++) {
                (function(index) {
                    tabs[index].addEventListener('click', function() {
                        self.switchTab(index);
                    });
                })(i);
            }

            var searchBtn = document.querySelector('.js-search-btn');
            if (searchBtn) {
                searchBtn.addEventListener('click', function() {
                    self.showSearch();
                });
            }

            var modalCloseBtn = document.getElementById('modal-close-btn');
            if (modalCloseBtn) {
                modalCloseBtn.addEventListener('click', function() {
                    self.hideModal();
                });
            }

            var requestBtn = document.getElementById('modal-request-btn');
            if (requestBtn) {
                requestBtn.addEventListener('click', function() {
                    self.requestCurrentItem();
                });
            }
        },

        /**
         * Set up keyboard/remote handlers
         * Following Jellyfin's approach: check defaultPrevented, then preventDefault
         */
        setupKeyHandlers: function() {
            var self = this;
            var keyCount = 0;

            // Use standard event listener (not capture phase) like Jellyfin
            document.addEventListener('keydown', function(e) {
                // Skip if already handled (Jellyfin's approach)
                if (e.defaultPrevented) {
                    self.debug('SKIP:defaultPrevented');
                    return;
                }

                var keyCode = e.keyCode;
                keyCount++;
                self.debug(keyCount + ')K:' + keyCode);

                // BLUE button ALWAYS toggles (even when hidden)
                if (keyCode === KEY_CODES.BLUE || keyCode === 66) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.toggle();
                    return false;
                }

                // Other keys only work when visible
                if (!self.isVisible) {
                    return;
                }

                // If modal is open, handle modal keys
                if (self.isModalOpen) {
                    if (keyCode === KEY_CODES.BACK || keyCode === 27) {
                        e.preventDefault();
                        e.stopPropagation();
                        self.hideModal();
                        return false;
                    }
                    return;
                }

                switch (keyCode) {
                    case KEY_CODES.BACK:
                    case 27: // ESC
                        e.preventDefault();
                        e.stopPropagation();
                        self.hide();
                        return false;

                    case KEY_CODES.LEFT:
                        e.preventDefault();
                        e.stopPropagation();
                        self.navigateLeft();
                        return false;

                    case KEY_CODES.RIGHT:
                        e.preventDefault();
                        e.stopPropagation();
                        self.navigateRight();
                        return false;

                    case KEY_CODES.UP:
                        e.preventDefault();
                        e.stopPropagation();
                        self.navigateUp();
                        return false;

                    case KEY_CODES.DOWN:
                        e.preventDefault();
                        e.stopPropagation();
                        self.navigateDown();
                        return false;

                    case KEY_CODES.ENTER:
                        e.preventDefault();
                        e.stopPropagation();
                        self.handleEnter();
                        return false;

                    case KEY_CODES.RED:
                        e.preventDefault();
                        self.showSettings();
                        break;

                    case KEY_CODES.GREEN:
                        e.preventDefault();
                        self.requestFocusedItem();
                        break;

                    case KEY_CODES.YELLOW:
                        e.preventDefault();
                        self.showFocusedItemDetails();
                        break;
                }
            }); // No capture phase - use bubble phase like Jellyfin
        },

        /**
         * Show JellyStream overlay
         */
        show: function() {
            var app = document.getElementById('jellystream-app');
            if (app) {
                app.classList.remove('hidden');
                this.isVisible = true;
                this.loadContent();
                this.focusArea = 'content';
                this.currentRowIndex = 0;
                this.currentCardIndex = 0;
                this.cacheRowsAndCards();
                this.updateFocus();
                console.log('JellyStreamHome: Shown');
            }
        },

        /**
         * Hide JellyStream overlay
         */
        hide: function() {
            var app = document.getElementById('jellystream-app');
            if (app) {
                app.classList.add('hidden');
                this.isVisible = false;
                console.log('JellyStreamHome: Hidden - Press BLUE to return');
            }
        },

        /**
         * Toggle visibility
         */
        toggle: function() {
            if (this.isVisible) {
                this.hide();
            } else {
                this.show();
            }
        },

        /**
         * Switch to a tab by index
         */
        switchTab: function(tabIndex) {
            if (tabIndex < 0 || tabIndex >= TABS.length) return;

            console.log('JellyStreamHome: Switching to tab', tabIndex, TABS[tabIndex]);

            this.currentTabIndex = tabIndex;

            // Update tab buttons
            var tabs = document.querySelectorAll('.js-nav-tab');
            for (var i = 0; i < tabs.length; i++) {
                tabs[i].classList.remove('active', 'focused');
                if (i === tabIndex) {
                    tabs[i].classList.add('active');
                    if (this.focusArea === 'nav') {
                        tabs[i].classList.add('focused');
                    }
                }
            }

            // Update tab content
            var contents = document.querySelectorAll('.js-tab-content');
            for (var j = 0; j < contents.length; j++) {
                contents[j].classList.remove('active');
            }
            var activeContent = document.getElementById('tab-' + TABS[tabIndex]);
            if (activeContent) {
                activeContent.classList.add('active');
            }

            // Reset content navigation
            this.currentRowIndex = 0;
            this.currentCardIndex = 0;
            this.cacheRowsAndCards();
        },

        /**
         * Cache rows and cards for current tab
         */
        cacheRowsAndCards: function() {
            var tabContent = document.getElementById('tab-' + TABS[this.currentTabIndex]);
            if (tabContent) {
                this.rows = Array.prototype.slice.call(tabContent.querySelectorAll('.js-card-row'));
            } else {
                this.rows = [];
            }

            if (this.rows.length > 0 && this.rows[this.currentRowIndex]) {
                this.cards = Array.prototype.slice.call(this.rows[this.currentRowIndex].querySelectorAll('.js-card, .js-genre-card'));
            } else {
                this.cards = [];
            }

            // Debug: console.log('CACHE rows:' + this.rows.length + ' cards:' + this.cards.length);
        },

        /**
         * Update focus based on current state
         */
        updateFocus: function() {
            // Clear all focus
            var allFocused = document.querySelectorAll('.focused');
            for (var i = 0; i < allFocused.length; i++) {
                allFocused[i].classList.remove('focused');
            }

            if (this.focusArea === 'nav') {
                // Focus on current tab
                var tabs = document.querySelectorAll('.js-nav-tab');
                if (tabs[this.currentTabIndex]) {
                    tabs[this.currentTabIndex].classList.add('focused');
                }
            } else {
                // Focus on current card
                if (this.cards.length > 0 && this.cards[this.currentCardIndex]) {
                    var card = this.cards[this.currentCardIndex];
                    card.classList.add('focused');
                    // Scroll into view
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        },

        /**
         * Navigate left
         */
        navigateLeft: function() {
            var before = this.currentCardIndex;
            if (this.focusArea === 'nav') {
                if (this.currentTabIndex > 0) {
                    this.switchTab(this.currentTabIndex - 1);
                    this.updateFocus();
                }
            } else {
                if (this.currentCardIndex > 0) {
                    this.currentCardIndex--;
                    this.updateFocus();
                }
            }
            this.debug('L:' + before + '->' + this.currentCardIndex);
        },

        /**
         * Navigate right
         */
        navigateRight: function() {
            var before = this.currentCardIndex;
            if (this.focusArea === 'nav') {
                if (this.currentTabIndex < TABS.length - 1) {
                    this.switchTab(this.currentTabIndex + 1);
                    this.updateFocus();
                }
            } else {
                if (this.currentCardIndex < this.cards.length - 1) {
                    this.currentCardIndex++;
                    this.updateFocus();
                }
            }
            this.debug('R:' + before + '->' + this.currentCardIndex);
        },

        /**
         * Navigate up
         */
        navigateUp: function() {
            if (this.focusArea === 'nav') {
                return; // Already at top
            }

            if (this.currentRowIndex > 0) {
                this.currentRowIndex--;
                this.currentCardIndex = 0;
                // Update cards cache for new row
                if (this.rows[this.currentRowIndex]) {
                    this.cards = Array.prototype.slice.call(this.rows[this.currentRowIndex].querySelectorAll('.js-card, .js-genre-card'));
                }
                this.updateFocus();
            } else {
                // Move to nav
                this.focusArea = 'nav';
                this.updateFocus();
            }
        },

        /**
         * Navigate down
         */
        navigateDown: function() {
            if (this.focusArea === 'nav') {
                this.focusArea = 'content';
                this.currentRowIndex = 0;
                this.currentCardIndex = 0;
                this.cacheRowsAndCards();
                this.updateFocus();
                return;
            }

            if (this.currentRowIndex < this.rows.length - 1) {
                this.currentRowIndex++;
                this.currentCardIndex = 0;
                // Update cards cache for new row
                if (this.rows[this.currentRowIndex]) {
                    this.cards = Array.prototype.slice.call(this.rows[this.currentRowIndex].querySelectorAll('.js-card, .js-genre-card'));
                }
                this.updateFocus();
            }
        },

        /**
         * Handle enter key
         */
        handleEnter: function() {
            if (this.focusArea === 'nav') {
                // Move focus to content
                this.focusArea = 'content';
                this.currentRowIndex = 0;
                this.currentCardIndex = 0;
                this.cacheRowsAndCards();
                this.updateFocus();
                return;
            }

            var focused = document.querySelector('.js-card.focused, .js-genre-card.focused');
            if (focused) {
                var mediaId = focused.getAttribute('data-id');
                var mediaType = focused.getAttribute('data-type');
                var genreId = focused.getAttribute('data-genre');

                if (genreId) {
                    this.loadGenre(genreId, mediaType, focused.textContent.trim());
                } else if (mediaId && mediaType) {
                    this.showDetails(mediaId, mediaType);
                }
            }
        },

        /**
         * Load content from Jellyseerr API
         */
        loadContent: function() {
            console.log('JellyStreamHome: Loading content');

            if (!window.JellyseerrAPI) {
                console.error('JellyStreamHome: JellyseerrAPI not available');
                return;
            }

            var self = this;

            // Load trending
            window.JellyseerrAPI.getTrending().then(function(data) {
                self.renderCards('trending-row', data.results || []);
                self.cacheRowsAndCards();
                self.updateFocus();
            }).catch(function(err) {
                console.error('JellyStreamHome: Failed to load trending', err);
            });

            // Load popular movies
            window.JellyseerrAPI.getPopularMovies().then(function(data) {
                self.renderCards('popular-movies-row', data.results || []);
                self.renderCards('all-movies-row', data.results || []);
            }).catch(function(err) {
                console.error('JellyStreamHome: Failed to load movies', err);
            });

            // Load popular TV
            window.JellyseerrAPI.getPopularTv().then(function(data) {
                self.renderCards('popular-tv-row', data.results || []);
                self.renderCards('all-tv-row', data.results || []);
            }).catch(function(err) {
                console.error('JellyStreamHome: Failed to load TV', err);
            });

            // Load upcoming movies
            window.JellyseerrAPI.getUpcomingMovies().then(function(data) {
                self.renderCards('upcoming-movies-row', data.results || []);
            }).catch(function(err) {
                console.error('JellyStreamHome: Failed to load upcoming movies', err);
            });

            // Load upcoming TV
            window.JellyseerrAPI.getUpcomingTv().then(function(data) {
                self.renderCards('upcoming-tv-row', data.results || []);
            }).catch(function(err) {
                console.error('JellyStreamHome: Failed to load upcoming TV', err);
            });

            // Load requests
            window.JellyseerrAPI.getRequests().then(function(data) {
                self.renderRequestCards('my-requests-row', data.results || []);
            }).catch(function(err) {
                console.error('JellyStreamHome: Failed to load requests', err);
            });

            // Render genre cards
            this.renderGenres();
        },

        /**
         * Render cards to a row
         */
        renderCards: function(rowId, items) {
            var row = document.getElementById(rowId);
            if (!row) return;

            row.innerHTML = '';

            if (!items || items.length === 0) {
                row.innerHTML = '<div class="js-empty">No items available</div>';
                return;
            }

            var self = this;
            for (var i = 0; i < items.length; i++) {
                var card = self.createCard(items[i]);
                row.appendChild(card);
            }
        },

        /**
         * Create a card element - Streamyfin-inspired design
         */
        createCard: function(item) {
            var card = document.createElement('div');
            card.className = 'js-card';
            var mediaType = item.mediaType || (item.title ? 'movie' : 'tv');
            card.setAttribute('data-id', item.id || '');
            card.setAttribute('data-type', mediaType);

            var posterPath = item.posterPath
                ? 'https://image.tmdb.org/t/p/w300' + item.posterPath
                : '';

            var title = item.title || item.name || 'Unknown';
            var year = '';
            if (item.releaseDate) {
                year = item.releaseDate.substring(0, 4);
            } else if (item.firstAirDate) {
                year = item.firstAirDate.substring(0, 4);
            }

            // Status badge (circular icon style)
            var statusClass = '';
            if (item.mediaInfo) {
                var status = item.mediaInfo.status;
                if (status === 5) {
                    statusClass = 'available';
                } else if (status === 4) {
                    statusClass = 'partial';
                } else if (status === 3) {
                    statusClass = 'processing';
                } else if (status === 2) {
                    statusClass = 'pending';
                }
            }

            // Rating badge
            var ratingHtml = '';
            if (item.voteAverage && item.voteAverage > 0) {
                ratingHtml = '<div class="js-card-rating">' + item.voteAverage.toFixed(1) + '</div>';
            }

            // Media type badge
            var typeHtml = '<div class="js-card-type ' + mediaType + '">' + (mediaType === 'tv' ? 'TV' : 'Movie') + '</div>';

            var posterHtml = posterPath
                ? '<img src="' + posterPath + '" alt="">'
                : '<div class="js-card-no-poster">No Image</div>';

            // Status badge (empty content, CSS adds the icon)
            var statusHtml = statusClass
                ? '<div class="js-card-status ' + statusClass + '"></div>'
                : '<div class="js-card-status requestable"></div>';

            card.innerHTML = '<div class="js-card-poster">' +
                posterHtml +
                typeHtml +
                ratingHtml +
                statusHtml +
                '</div>' +
                '<div class="js-card-info">' +
                '<div class="js-card-title">' + this.escapeHtml(title) + '</div>' +
                (year ? '<div class="js-card-year">' + year + '</div>' : '') +
                '</div>';

            var self = this;
            card.addEventListener('click', function() {
                self.showDetails(item.id, mediaType);
            });

            return card;
        },

        /**
         * Escape HTML
         */
        escapeHtml: function(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        /**
         * Render request cards - fetches details for each request
         */
        renderRequestCards: function(rowId, requests) {
            var row = document.getElementById(rowId);
            if (!row) return;

            row.innerHTML = '';

            if (!requests || requests.length === 0) {
                row.innerHTML = '<div class="js-empty">No requests yet. Browse and request content!</div>';
                return;
            }

            var self = this;

            // Requests only have tmdbId - we need to fetch details for each
            for (var i = 0; i < requests.length; i++) {
                (function(request, index) {
                    var media = request.media || {};
                    var tmdbId = media.tmdbId || request.mediaId;
                    var mediaType = request.type || 'movie';
                    var status = media.status || request.status || 2;

                    if (!tmdbId) {
                        console.warn('Request missing tmdbId:', request);
                        return;
                    }

                    // Create placeholder card
                    var placeholder = document.createElement('div');
                    placeholder.className = 'js-card';
                    placeholder.innerHTML = '<div class="js-card-poster"><div class="js-card-no-poster">Loading...</div></div><div class="js-card-info"><div class="js-card-title">Loading...</div></div>';
                    row.appendChild(placeholder);

                    // Fetch actual details
                    window.JellyseerrAPI.getMediaDetails(mediaType, tmdbId)
                        .then(function(details) {
                            var item = {
                                id: tmdbId,
                                title: details.title || details.name || 'Unknown',
                                posterPath: details.posterPath,
                                releaseDate: details.releaseDate,
                                firstAirDate: details.firstAirDate,
                                mediaType: mediaType,
                                mediaInfo: { status: status }
                            };
                            var card = self.createCard(item);
                            row.replaceChild(card, placeholder);

                            // Re-cache if this is current tab
                            if (self.currentTabIndex === 3) {
                                self.cacheRowsAndCards();
                            }
                        })
                        .catch(function(err) {
                            console.error('Failed to load request details:', err);
                            placeholder.innerHTML = '<div class="js-card-poster"><div class="js-card-no-poster">Error</div></div><div class="js-card-info"><div class="js-card-title">Failed to load</div></div>';
                        });
                })(requests[i], i);
            }
        },

        /**
         * Render genre cards
         */
        renderGenres: function() {
            var movieGenres = [
                { id: 28, name: 'Action' },
                { id: 12, name: 'Adventure' },
                { id: 16, name: 'Animation' },
                { id: 35, name: 'Comedy' },
                { id: 80, name: 'Crime' },
                { id: 18, name: 'Drama' },
                { id: 14, name: 'Fantasy' },
                { id: 27, name: 'Horror' },
                { id: 878, name: 'Sci-Fi' },
                { id: 53, name: 'Thriller' }
            ];

            var tvGenres = [
                { id: 10759, name: 'Action' },
                { id: 16, name: 'Animation' },
                { id: 35, name: 'Comedy' },
                { id: 80, name: 'Crime' },
                { id: 18, name: 'Drama' },
                { id: 10765, name: 'Sci-Fi' },
                { id: 9648, name: 'Mystery' },
                { id: 10764, name: 'Reality' }
            ];

            this.renderGenreRow('movie-genres', movieGenres, 'movie');
            this.renderGenreRow('tv-genres', tvGenres, 'tv');
        },

        /**
         * Render genre row
         */
        renderGenreRow: function(rowId, genres, mediaType) {
            var row = document.getElementById(rowId);
            if (!row) return;

            row.innerHTML = '';
            var self = this;

            for (var i = 0; i < genres.length; i++) {
                var genre = genres[i];
                var card = document.createElement('div');
                card.className = 'js-genre-card';
                card.setAttribute('data-genre', genre.id);
                card.setAttribute('data-type', mediaType);
                card.textContent = genre.name;

                (function(g) {
                    card.addEventListener('click', function() {
                        self.loadGenre(g.id, mediaType, g.name);
                    });
                })(genre);

                row.appendChild(card);
            }
        },

        /**
         * Load content by genre
         */
        loadGenre: function(genreId, mediaType, genreName) {
            console.log('JellyStreamHome: Loading genre', genreName);

            var self = this;
            var rowId = mediaType === 'movie' ? 'all-movies-row' : 'all-tv-row';
            var row = document.getElementById(rowId);

            if (row) {
                row.innerHTML = '<div class="js-loading">Loading ' + genreName + '...</div>';
            }

            if (window.JellyseerrAPI && window.JellyseerrAPI.discoverByGenre) {
                window.JellyseerrAPI.discoverByGenre(mediaType, genreId).then(function(data) {
                    self.renderCards(rowId, data.results || []);
                    self.cacheRowsAndCards();
                }).catch(function(err) {
                    console.error('JellyStreamHome: Failed to load genre', err);
                    if (row) {
                        row.innerHTML = '<div class="js-empty">Failed to load</div>';
                    }
                });
            }
        },

        /**
         * Show item details modal - loads Jellyseerr page in iframe
         */
        showDetails: function(mediaId, mediaType) {
            console.log('JellyStreamHome: Showing details', mediaId, mediaType);

            var modal = document.getElementById('js-modal');
            if (!modal) return;

            this.isModalOpen = true;
            this.currentModalItem = { id: mediaId, type: mediaType };
            modal.classList.remove('hidden');

            // Get Jellyseerr base URL from config
            var jellyseerrUrl = '';
            if (window.JellyStreamConfig) {
                var config = window.JellyStreamConfig.getJellyseerrConfig();
                jellyseerrUrl = config.serverUrl || '';
            }

            // Update title bar
            var titleBar = document.getElementById('modal-title-bar');
            if (titleBar) {
                titleBar.textContent = 'Loading ' + (mediaType === 'movie' ? 'Movie' : 'TV Show') + '...';
            }

            // Construct the Jellyseerr detail page URL
            // Jellyseerr uses: /movie/{tmdbId} or /tv/{tmdbId}
            var detailUrl = jellyseerrUrl + '/' + mediaType + '/' + mediaId;
            console.log('JellyStreamHome: Loading iframe URL:', detailUrl);

            // Load into iframe
            var iframe = document.getElementById('js-modal-iframe');
            if (iframe) {
                iframe.src = detailUrl;

                // Update title when iframe loads
                iframe.onload = function() {
                    if (titleBar) {
                        titleBar.textContent = 'Jellyseerr - ' + (mediaType === 'movie' ? 'Movie' : 'TV Show');
                    }
                };
            }

            // Focus close button
            setTimeout(function() {
                var closeBtn = document.getElementById('modal-close-btn');
                if (closeBtn) closeBtn.focus();
            }, 100);
        },

        /**
         * Render modal content - Streamyfin-inspired
         */
        renderModalContent: function(data) {
            var posterPath = data.posterPath
                ? 'https://image.tmdb.org/t/p/w500' + data.posterPath
                : '';

            var title = data.title || data.name || 'Unknown';
            var year = (data.releaseDate || data.firstAirDate || '').substring(0, 4);
            var rating = data.voteAverage ? '\u2605 ' + data.voteAverage.toFixed(1) : '';
            var overview = data.overview || 'No description available.';

            // Runtime (movies have runtime, TV has episodeRunTime)
            var runtime = '';
            if (data.runtime) {
                var hours = Math.floor(data.runtime / 60);
                var mins = data.runtime % 60;
                runtime = hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';
            } else if (data.episodeRunTime && data.episodeRunTime.length > 0) {
                runtime = data.episodeRunTime[0] + 'm/ep';
            }

            // Media type
            var mediaType = data.mediaType || (data.title ? 'Movie' : 'TV Show');
            if (data.numberOfSeasons) {
                mediaType = data.numberOfSeasons + ' Season' + (data.numberOfSeasons > 1 ? 's' : '');
            }

            // Language
            var language = (data.originalLanguage || 'en').toUpperCase();

            // Populate basic info
            document.getElementById('modal-poster').src = posterPath;
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-year').textContent = year;
            document.getElementById('modal-rating').textContent = rating;
            document.getElementById('modal-runtime').textContent = runtime;
            document.getElementById('modal-overview').textContent = overview;

            // Populate info row
            var mediaStatusEl = document.getElementById('modal-media-status');
            var typeEl = document.getElementById('modal-type');
            var langEl = document.getElementById('modal-language');
            if (typeEl) typeEl.textContent = mediaType;
            if (langEl) langEl.textContent = language;

            // Render genres
            var genresContainer = document.getElementById('modal-genres');
            if (genresContainer && data.genres) {
                genresContainer.innerHTML = '';
                for (var i = 0; i < data.genres.length && i < 5; i++) {
                    var tag = document.createElement('span');
                    tag.className = 'js-modal-genre-tag';
                    tag.textContent = data.genres[i].name;
                    genresContainer.appendChild(tag);
                }
            }

            var requestBtn = document.getElementById('modal-request-btn');
            var statusDiv = document.getElementById('modal-status');

            if (data.mediaInfo && data.mediaInfo.status) {
                var status = data.mediaInfo.status;
                var statusText = '';
                if (status === 5) {
                    statusText = 'Available';
                    requestBtn.style.display = 'none';
                    statusDiv.textContent = 'Available in your library';
                    statusDiv.className = 'js-modal-status available';
                } else if (status === 4) {
                    statusText = 'Partial';
                    requestBtn.style.display = 'none';
                    statusDiv.textContent = 'Partially available';
                    statusDiv.className = 'js-modal-status processing';
                } else if (status === 3) {
                    statusText = 'Processing';
                    requestBtn.style.display = 'none';
                    statusDiv.textContent = 'Request is being processed';
                    statusDiv.className = 'js-modal-status processing';
                } else if (status === 2) {
                    statusText = 'Pending';
                    requestBtn.style.display = 'none';
                    statusDiv.textContent = 'Request pending approval';
                    statusDiv.className = 'js-modal-status pending';
                } else {
                    statusText = 'Not Requested';
                    requestBtn.style.display = '';
                    statusDiv.textContent = '';
                }
                if (mediaStatusEl) mediaStatusEl.textContent = statusText;
            } else {
                requestBtn.style.display = '';
                statusDiv.textContent = '';
                if (mediaStatusEl) mediaStatusEl.textContent = 'Not Requested';
            }
        },

        /**
         * Hide details modal
         */
        hideModal: function() {
            var modal = document.getElementById('js-modal');
            if (modal) {
                modal.classList.add('hidden');
            }

            // Clear iframe to stop any loading/video
            var iframe = document.getElementById('js-modal-iframe');
            if (iframe) {
                iframe.src = 'about:blank';
            }

            this.isModalOpen = false;
            this.updateFocus();
        },

        /**
         * Request current modal item
         */
        requestCurrentItem: function() {
            if (!this.currentModalItem) return;

            var self = this;
            var statusDiv = document.getElementById('modal-status');
            var requestBtn = document.getElementById('modal-request-btn');

            statusDiv.textContent = 'Requesting...';
            requestBtn.disabled = true;

            window.JellyseerrAPI.requestMedia(this.currentModalItem.type, this.currentModalItem.id)
                .then(function() {
                    statusDiv.textContent = 'Request submitted!';
                    statusDiv.className = 'js-modal-status requested';
                    requestBtn.style.display = 'none';
                })
                .catch(function(err) {
                    statusDiv.textContent = 'Failed: ' + (err.message || 'Unknown error');
                    statusDiv.className = 'js-modal-status error';
                    requestBtn.disabled = false;
                });
        },

        /**
         * Request focused item (GREEN button)
         */
        requestFocusedItem: function() {
            var focused = document.querySelector('.js-card.focused');
            if (focused) {
                var mediaId = focused.getAttribute('data-id');
                var mediaType = focused.getAttribute('data-type');
                if (mediaId && mediaType) {
                    this.showDetails(mediaId, mediaType);
                }
            }
        },

        /**
         * Show focused item details (YELLOW button)
         */
        showFocusedItemDetails: function() {
            this.requestFocusedItem();
        },

        /**
         * Show settings
         */
        showSettings: function() {
            if (window.JellyStreamSettingsUI) {
                window.JellyStreamSettingsUI.show();
            }
        },

        /**
         * Show search - placeholder
         */
        showSearch: function() {
            console.log('JellyStreamHome: Search not yet implemented');
        },

        /**
         * Refresh content
         */
        refresh: function() {
            this.loadContent();
        }
    };

    // Export to window
    window.JellyStreamHome = JellyStreamHome;

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            JellyStreamHome.init();
        });
    } else {
        setTimeout(function() {
            JellyStreamHome.init();
        }, 500);
    }

})(window);
