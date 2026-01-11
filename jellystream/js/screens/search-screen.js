/**
 * JellyStream - Search Screen
 * Unified search across Jellyfin library and Jellyseerr discovery
 */
(function(window, document) {
    'use strict';

    var SearchScreen = {
        initialized: false,
        searchQuery: '',
        jellyfinResults: [],
        jellyseerrResults: [],
        mergedResults: [],
        libraryMap: {}, // Map of normalized titles to Jellyfin items
        isSearching: false,
        searchTimeout: null,
        selectedKeyIndex: 0,

        // On-screen keyboard layout
        keyboard: [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', "'"],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '.', '/'],
            ['SPACE', 'BACKSPACE', 'CLEAR', 'SEARCH']
        ],

        /**
         * Initialize search screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('SearchScreen: Initializing');

            this.renderKeyboard();
            this.bindEvents();
            this.initialized = true;

            console.log('SearchScreen: Initialized');
        },

        /**
         * Load search screen
         */
        load: function() {
            console.log('SearchScreen: Loading');

            // Clear previous search
            this.searchQuery = '';
            this.jellyfinResults = [];
            this.jellyseerrResults = [];
            this.mergedResults = [];
            this.libraryMap = {};
            this.updateSearchInput();
            this.clearResults();

            // Focus first keyboard key
            setTimeout(function() {
                var firstKey = document.querySelector('.keyboard-key.focusable');
                if (firstKey && window.FocusManager) {
                    window.FocusManager.setFocus(firstKey);
                }
            }, 100);
        },

        /**
         * Render on-screen keyboard
         */
        renderKeyboard: function() {
            var container = document.getElementById('search-keyboard');
            if (!container) return;

            var html = '';
            this.keyboard.forEach(function(row, rowIndex) {
                html += '<div class="keyboard-row">';
                row.forEach(function(key) {
                    var keyClass = 'keyboard-key focusable';
                    var displayKey = key;
                    var dataKey = key;

                    // Special keys
                    if (key === 'SPACE') {
                        keyClass += ' key-space';
                        displayKey = 'Space';
                    } else if (key === 'BACKSPACE') {
                        keyClass += ' key-action';
                        displayKey = '⌫';
                    } else if (key === 'CLEAR') {
                        keyClass += ' key-action';
                        displayKey = 'Clear';
                    } else if (key === 'SEARCH') {
                        keyClass += ' key-action key-search';
                        displayKey = 'Search';
                    }

                    html += '<button class="' + keyClass + '" data-key="' + dataKey + '" tabindex="0">' + displayKey + '</button>';
                });
                html += '</div>';
            });

            container.innerHTML = html;
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            var self = this;

            // Keyboard key clicks
            var keyboard = document.getElementById('search-keyboard');
            if (keyboard) {
                keyboard.addEventListener('click', function(e) {
                    var key = e.target.closest('.keyboard-key');
                    if (key) {
                        self.handleKeyPress(key.dataset.key);
                    }
                });
            }

            // Physical keyboard input (for testing in browser)
            var searchInput = document.getElementById('search-input-display');
            if (searchInput) {
                document.addEventListener('keypress', function(e) {
                    if (window.StateManager && window.StateManager.ui.currentScreen === 'search-screen') {
                        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                            self.handleKeyPress(e.key.toUpperCase());
                        }
                    }
                });

                document.addEventListener('keydown', function(e) {
                    if (window.StateManager && window.StateManager.ui.currentScreen === 'search-screen') {
                        if (e.key === 'Backspace') {
                            e.preventDefault();
                            self.handleKeyPress('BACKSPACE');
                        } else if (e.key === 'Enter') {
                            self.performSearch();
                        }
                    }
                });
            }
        },

        /**
         * Handle keyboard key press
         */
        handleKeyPress: function(key) {
            console.log('SearchScreen: Key pressed', key);

            switch (key) {
                case 'SPACE':
                    this.searchQuery += ' ';
                    break;
                case 'BACKSPACE':
                    this.searchQuery = this.searchQuery.slice(0, -1);
                    break;
                case 'CLEAR':
                    this.searchQuery = '';
                    this.jellyfinResults = [];
                    this.jellyseerrResults = [];
                    this.mergedResults = [];
                    this.libraryMap = {};
                    this.clearResults();
                    break;
                case 'SEARCH':
                    this.performSearch();
                    return;
                default:
                    this.searchQuery += key;
            }

            this.updateSearchInput();

            // Auto-search after typing (debounced)
            this.debounceSearch();
        },

        /**
         * Debounce search to avoid too many API calls
         */
        debounceSearch: function() {
            var self = this;

            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }

            // Only auto-search if query is 2+ characters
            if (this.searchQuery.length >= 2) {
                this.searchTimeout = setTimeout(function() {
                    self.performSearch();
                }, 500);
            }
        },

        /**
         * Update search input display
         */
        updateSearchInput: function() {
            var display = document.getElementById('search-input-display');
            if (display) {
                display.textContent = this.searchQuery || 'Type to search...';
                display.classList.toggle('placeholder', !this.searchQuery);
            }
        },

        /**
         * Normalize title for matching
         */
        normalizeTitle: function(title) {
            if (!title) return '';
            return title.toLowerCase()
                .replace(/[^a-z0-9]/g, '')
                .trim();
        },

        /**
         * Build library map from Jellyfin results
         */
        buildLibraryMap: function() {
            var self = this;
            this.libraryMap = {};

            this.jellyfinResults.forEach(function(item) {
                var key = self.normalizeTitle(item.Name);
                if (key) {
                    // Store by normalized name, prefer Movies/Series over Episodes
                    if (!self.libraryMap[key] || item.Type !== 'Episode') {
                        self.libraryMap[key] = item;
                    }
                }
            });

            console.log('SearchScreen: Library map built with', Object.keys(this.libraryMap).length, 'items');
        },

        /**
         * Check if item exists in library
         */
        findInLibrary: function(item) {
            var title = item.title || item.name;
            var key = this.normalizeTitle(title);
            return this.libraryMap[key] || null;
        },

        /**
         * Merge results from both sources
         */
        mergeResults: function() {
            var self = this;
            this.mergedResults = [];

            // Build library map first
            this.buildLibraryMap();

            // Check if Jellyseerr is configured and has results
            var jellyseerrConfigured = window.JellyseerrClient && window.JellyseerrClient.isConfigured();

            if (jellyseerrConfigured && this.jellyseerrResults.length > 0) {
                // Use Jellyseerr results as base, mark which are in library
                this.jellyseerrResults.forEach(function(item) {
                    var libraryItem = self.findInLibrary(item);
                    self.mergedResults.push({
                        jellyseerr: item,
                        jellyfin: libraryItem,
                        inLibrary: !!libraryItem
                    });
                });
            } else {
                // No Jellyseerr, just show Jellyfin results
                this.jellyfinResults.forEach(function(item) {
                    self.mergedResults.push({
                        jellyfin: item,
                        jellyseerr: null,
                        inLibrary: true
                    });
                });
            }

            console.log('SearchScreen: Merged results', this.mergedResults.length);
        },

        /**
         * Perform search on both sources
         */
        performSearch: function() {
            var self = this;

            if (!this.searchQuery.trim()) {
                this.clearResults();
                return;
            }

            if (this.isSearching) return;

            console.log('SearchScreen: Searching for', this.searchQuery);
            this.isSearching = true;
            this.showLoading(true);

            var query = this.searchQuery.trim();
            var promises = [];

            // Always search Jellyfin
            promises.push(
                window.JellyfinClient.search(query, {
                    includeItemTypes: 'Movie,Series',
                    limit: 50,
                    recursive: true,
                    fields: 'PrimaryImageAspectRatio,Overview'
                })
                .then(function(response) {
                    self.jellyfinResults = response.Items || [];
                    console.log('SearchScreen: Jellyfin results', self.jellyfinResults.length);
                })
                .catch(function(error) {
                    console.error('SearchScreen: Jellyfin search failed', error);
                    self.jellyfinResults = [];
                })
            );

            // Search Jellyseerr if configured
            if (window.JellyseerrClient && window.JellyseerrClient.isConfigured()) {
                promises.push(
                    window.JellyseerrClient.search(query)
                        .then(function(response) {
                            self.jellyseerrResults = response.results || [];
                            console.log('SearchScreen: Jellyseerr results', self.jellyseerrResults.length);
                        })
                        .catch(function(error) {
                            console.error('SearchScreen: Jellyseerr search failed', error);
                            self.jellyseerrResults = [];
                        })
                );
            }

            Promise.all(promises)
                .then(function() {
                    self.mergeResults();
                    self.renderResults();
                    self.isSearching = false;
                    self.showLoading(false);
                });
        },

        /**
         * Render unified search results
         */
        renderResults: function() {
            var container = document.getElementById('search-results');
            if (!container) return;

            if (this.mergedResults.length === 0) {
                var noResultsMsg = this.searchQuery
                    ? 'No results found for "' + this.escapeHtml(this.searchQuery) + '"'
                    : 'Start typing to search';

                container.innerHTML = '<p class="search-no-results">' + noResultsMsg + '</p>';
                this.updateResultCount(0);
                return;
            }

            var html = '<div class="search-results-grid">';
            var self = this;

            this.mergedResults.forEach(function(result, index) {
                html += self.createResultCard(result, index);
            });

            html += '</div>';
            container.innerHTML = html;

            // Bind click events
            this.bindResultEvents();
            this.updateResultCount(this.mergedResults.length);
        },

        /**
         * Create unified result card
         */
        createResultCard: function(result, index) {
            var item = result.jellyseerr || result.jellyfin;
            var inLibrary = result.inLibrary;
            var jellyfinItem = result.jellyfin;
            var jellyseerrItem = result.jellyseerr;

            // Determine image URL
            var imageUrl;
            if (jellyseerrItem && jellyseerrItem.posterPath) {
                imageUrl = 'https://image.tmdb.org/t/p/w500' + jellyseerrItem.posterPath;
            } else if (jellyfinItem) {
                imageUrl = this.getJellyfinImageUrl(jellyfinItem);
            } else {
                imageUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23333" width="200" height="300"/%3E%3C/svg%3E';
            }

            // Determine title and type
            var title, mediaType, typeLabel;
            if (jellyseerrItem) {
                title = jellyseerrItem.title || jellyseerrItem.name || 'Unknown';
                mediaType = jellyseerrItem.mediaType || (jellyseerrItem.title ? 'movie' : 'tv');
                typeLabel = mediaType === 'movie' ? 'Movie' : 'TV Show';
            } else {
                title = jellyfinItem.Name;
                mediaType = jellyfinItem.Type === 'Movie' ? 'movie' : 'tv';
                typeLabel = this.getTypeLabel(jellyfinItem);
            }

            // Build status badge
            var statusBadge = '';
            if (inLibrary) {
                statusBadge = '<span class="result-status-badge status-in-library">In Library</span>';
            } else if (jellyseerrItem && jellyseerrItem.mediaInfo) {
                var status = jellyseerrItem.mediaInfo.status;
                if (status === 5) {
                    statusBadge = '<span class="result-status-badge status-available">Available</span>';
                } else if (status >= 2) {
                    statusBadge = '<span class="result-status-badge status-requested">Requested</span>';
                }
            }

            // Data attributes for click handling
            var dataAttrs = 'data-index="' + index + '"';
            if (inLibrary && jellyfinItem) {
                dataAttrs += ' data-source="jellyfin" data-item-id="' + jellyfinItem.Id + '"';
            } else if (jellyseerrItem) {
                dataAttrs += ' data-source="jellyseerr" data-tmdb-id="' + jellyseerrItem.id + '" data-media-type="' + mediaType + '"';
            }

            var html = '<div class="search-result-card focusable" tabindex="0" ' + dataAttrs + '>';
            html += '<div class="result-card-image" style="background-image: url(\'' + imageUrl + '\')">';
            html += '<span class="result-type-badge">' + typeLabel + '</span>';
            html += statusBadge;
            html += '</div>';
            html += '<div class="result-card-info">';
            html += '<h3 class="result-card-title">' + this.escapeHtml(title) + '</h3>';
            html += '<p class="result-card-meta">' + this.getCardMeta(result) + '</p>';
            html += '</div>';
            html += '</div>';

            return html;
        },

        /**
         * Get card metadata
         */
        getCardMeta: function(result) {
            var meta = [];
            var item = result.jellyseerr || result.jellyfin;

            if (result.jellyseerr) {
                var date = result.jellyseerr.releaseDate || result.jellyseerr.firstAirDate;
                if (date) {
                    meta.push(date.substring(0, 4));
                }
                if (result.jellyseerr.voteAverage) {
                    meta.push('★ ' + result.jellyseerr.voteAverage.toFixed(1));
                }
            } else if (result.jellyfin) {
                if (result.jellyfin.ProductionYear) {
                    meta.push(result.jellyfin.ProductionYear);
                }
                if (result.jellyfin.CommunityRating) {
                    meta.push('★ ' + result.jellyfin.CommunityRating.toFixed(1));
                }
            }

            return meta.join(' • ') || '';
        },

        /**
         * Update result count display
         */
        updateResultCount: function(count) {
            var countEl = document.getElementById('search-results-count');
            if (countEl) {
                countEl.textContent = count > 0 ? count + ' results' : '';
            }
        },

        /**
         * Get Jellyfin image URL
         */
        getJellyfinImageUrl: function(item) {
            var serverUrl = window.StateManager.jellyfin.serverUrl;

            if (item.ImageTags && item.ImageTags.Primary) {
                return serverUrl + '/Items/' + item.Id + '/Images/Primary?maxWidth=300&quality=90';
            }

            if (item.Type === 'Episode' && item.SeriesId) {
                return serverUrl + '/Items/' + item.SeriesId + '/Images/Primary?maxWidth=300&quality=90';
            }

            return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23333" width="200" height="300"/%3E%3C/svg%3E';
        },

        /**
         * Get type label
         */
        getTypeLabel: function(item) {
            switch (item.Type) {
                case 'Movie': return 'Movie';
                case 'Series': return 'TV Show';
                case 'Episode': return 'Episode';
                default: return item.Type;
            }
        },

        /**
         * Bind result card events
         */
        bindResultEvents: function() {
            var self = this;
            var cards = document.querySelectorAll('.search-result-card');

            cards.forEach(function(card) {
                card.addEventListener('click', function() {
                    var source = this.dataset.source;

                    if (source === 'jellyfin') {
                        var itemId = this.dataset.itemId;
                        self.handleJellyfinClick(itemId);
                    } else if (source === 'jellyseerr') {
                        var tmdbId = parseInt(this.dataset.tmdbId, 10);
                        var mediaType = this.dataset.mediaType;
                        self.handleJellyseerrClick(tmdbId, mediaType);
                    }
                });
            });
        },

        /**
         * Handle Jellyfin result click
         */
        handleJellyfinClick: function(itemId) {
            console.log('SearchScreen: Jellyfin item clicked', itemId);

            var item = this.jellyfinResults.find(function(i) {
                return i.Id === itemId;
            });

            if (item && window.ModalManager) {
                window.ModalManager.showDetails(item, 'jellyfin');
            }
        },

        /**
         * Handle Jellyseerr result click
         */
        handleJellyseerrClick: function(tmdbId, mediaType) {
            console.log('SearchScreen: Jellyseerr item clicked', tmdbId, mediaType);

            var self = this;

            // Fetch full details from Jellyseerr
            window.JellyseerrClient.getMediaDetails(mediaType, tmdbId)
                .then(function(details) {
                    if (window.ModalManager) {
                        window.ModalManager.showDetails(details, 'jellyseerr');
                    }
                })
                .catch(function(error) {
                    console.error('SearchScreen: Failed to load details', error);
                    self.showToast('Failed to load details');
                });
        },

        /**
         * Clear results
         */
        clearResults: function() {
            var container = document.getElementById('search-results');
            if (container) {
                container.innerHTML = '<p class="search-placeholder">Start typing to search</p>';
            }
        },

        /**
         * Show loading state
         */
        showLoading: function(show) {
            var loader = document.getElementById('search-loading');
            if (loader) {
                loader.style.display = show ? 'flex' : 'none';
            }
        },

        /**
         * Show error message
         */
        showError: function(message) {
            var container = document.getElementById('search-results');
            if (container) {
                container.innerHTML = '<p class="search-error">' + message + '</p>';
            }
        },

        /**
         * Show toast notification
         */
        showToast: function(message) {
            var container = document.getElementById('toast-container');
            if (!container) return;

            var toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            container.appendChild(toast);

            setTimeout(function() {
                toast.classList.add('fade-out');
                setTimeout(function() {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, 3000);
        },

        /**
         * Escape HTML
         */
        escapeHtml: function(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // Export to global scope
    window.SearchScreen = SearchScreen;

})(window, document);
