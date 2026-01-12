/**
 * JellyStream - Library Screen
 * Browse Jellyfin libraries (Movies, TV Shows, Collections, etc.)
 */
(function(window, document) {
    'use strict';

    var LibraryScreen = {
        initialized: false,
        libraries: [],
        currentLibrary: null,
        currentItems: [],
        currentPage: 0,
        pageSize: 24,
        totalItems: 0,
        sortBy: 'SortName',
        sortOrder: 'Ascending',
        isLoading: false,

        /**
         * Initialize library screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('LibraryScreen: Initializing');

            this.bindEvents();
            this.initialized = true;

            console.log('LibraryScreen: Initialized');
        },

        /**
         * Load library screen
         */
        load: function() {
            console.log('LibraryScreen: Loading');

            // Reset state
            this.currentPage = 0;
            this.currentItems = [];

            // Load user libraries
            this.loadLibraries();
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            var self = this;

            // Sort select change
            var sortSelect = document.getElementById('library-sort');
            if (sortSelect) {
                sortSelect.addEventListener('change', function() {
                    self.handleSortChange(this.value);
                });
            }

            // Load more on scroll (infinite scroll)
            var grid = document.getElementById('library-grid');
            if (grid) {
                grid.addEventListener('scroll', function() {
                    if (self.isNearBottom(grid) && !self.isLoading) {
                        self.loadMoreItems();
                    }
                });
            }
        },

        /**
         * Load user libraries from Jellyfin
         */
        loadLibraries: function() {
            var self = this;

            console.log('LibraryScreen: Loading libraries');
            this.showLoading(true);

            window.JellyfinClient.getUserViews()
                .then(function(response) {
                    console.log('LibraryScreen: Libraries loaded', response);

                    if (response.Items && response.Items.length > 0) {
                        self.libraries = response.Items.filter(function(lib) {
                            // Filter to media libraries only
                            return ['movies', 'tvshows', 'music', 'boxsets', 'mixed'].indexOf(lib.CollectionType) !== -1 ||
                                   !lib.CollectionType; // Include libraries without type
                        });

                        self.renderLibraryTabs();

                        // Select first library by default
                        if (self.libraries.length > 0) {
                            self.selectLibrary(self.libraries[0]);
                        }
                    } else {
                        self.showEmpty('No libraries found');
                    }

                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('LibraryScreen: Failed to load libraries', error);
                    self.showError('Failed to load libraries: ' + error.message);
                    self.showLoading(false);
                });
        },

        /**
         * Get sort order for library type (for preferred tab ordering)
         */
        getLibrarySortOrder: function(library) {
            var name = library.Name.toLowerCase();
            var type = library.CollectionType;

            // Preferred order: Movies, TV Shows, PVR/Recordings, Live TV/Headends
            if (type === 'movies' || name.includes('movie')) return 1;
            if (type === 'tvshows' || name.includes('tv show') || name.includes('series')) return 2;
            if (type === 'livetv' || name.includes('pvr') || name.includes('recording')) return 3;
            if (name.includes('headend') || name.includes('live')) return 4;
            return 5; // Everything else at the end
        },

        /**
         * Get display name for library tab
         */
        getLibraryDisplayName: function(name) {
            var lowerName = name.toLowerCase();
            if (lowerName.includes('nextpvr') || lowerName.includes('pvr') || lowerName.includes('recording')) {
                return 'NEXTPVR';
            }
            if (lowerName.includes('tvheadend') || lowerName.includes('headend')) {
                return 'TVHEADEND';
            }
            return name;
        },

        /**
         * Render library tabs
         */
        renderLibraryTabs: function() {
            var tabsContainer = document.getElementById('library-tabs');
            if (!tabsContainer) return;

            tabsContainer.innerHTML = '';

            // Sort libraries in preferred order
            var self = this;
            var sortedLibraries = this.libraries.slice().sort(function(a, b) {
                return self.getLibrarySortOrder(a) - self.getLibrarySortOrder(b);
            });

            // Update the libraries array to match sorted order
            this.libraries = sortedLibraries;

            sortedLibraries.forEach(function(library) {
                var tab = document.createElement('button');
                tab.className = 'library-tab focusable';
                tab.textContent = this.getLibraryDisplayName(library.Name);
                tab.dataset.libraryId = library.Id;
                tab.tabIndex = 0;

                tab.addEventListener('click', function() {
                    this.selectLibrary(library);
                }.bind(this));

                tabsContainer.appendChild(tab);
            }.bind(this));
        },

        /**
         * Select a library
         */
        selectLibrary: function(library) {
            console.log('LibraryScreen: Selecting library', library.Name);

            this.currentLibrary = library;
            this.currentPage = 0;
            this.currentItems = [];

            // Update tab active state
            var tabs = document.querySelectorAll('.library-tab');
            tabs.forEach(function(tab) {
                tab.classList.remove('active');
                if (tab.dataset.libraryId === library.Id) {
                    tab.classList.add('active');
                }
            });

            // Update title
            var title = document.getElementById('library-title');
            if (title) {
                title.textContent = library.Name;
            }

            // Load items
            this.loadLibraryItems();
        },

        /**
         * Load items from current library
         */
        loadLibraryItems: function() {
            var self = this;

            if (!this.currentLibrary || this.isLoading) return;

            console.log('LibraryScreen: Loading items for', this.currentLibrary.Name);
            this.isLoading = true;
            this.showLoading(true);

            var options = {
                parentId: this.currentLibrary.Id,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder,
                limit: this.pageSize,
                startIndex: this.currentPage * this.pageSize,
                recursive: true,
                fields: 'PrimaryImageAspectRatio,BasicSyncInfo,CriticRating,CommunityRating,OfficialRating,ChildCount,Status',
                includeItemTypes: this.getItemTypes()
            };

            window.JellyfinClient.getItems(options)
                .then(function(response) {
                    console.log('LibraryScreen: Items loaded', response);

                    self.totalItems = response.TotalRecordCount || 0;

                    if (response.Items && response.Items.length > 0) {
                        self.currentItems = self.currentItems.concat(response.Items);
                        self.renderItems(response.Items, self.currentPage === 0);
                    } else if (self.currentPage === 0) {
                        self.showEmpty('No items in this library');
                    }

                    self.updateItemCount();
                    self.isLoading = false;
                    self.showLoading(false);

                    // Focus first item if this is the first page
                    if (self.currentPage === 0 && window.FocusManager) {
                        setTimeout(function() {
                            var firstCard = document.querySelector('#library-grid .media-card');
                            if (firstCard) {
                                window.FocusManager.setFocus(firstCard);
                            }
                        }, 100);
                    }
                })
                .catch(function(error) {
                    console.error('LibraryScreen: Failed to load items', error);
                    self.showError('Failed to load items: ' + error.message);
                    self.isLoading = false;
                    self.showLoading(false);
                });
        },

        /**
         * Load more items (pagination)
         */
        loadMoreItems: function() {
            if (this.currentItems.length >= this.totalItems) {
                console.log('LibraryScreen: No more items to load');
                return;
            }

            this.currentPage++;
            this.loadLibraryItems();
        },

        /**
         * Get item types based on library type
         */
        getItemTypes: function() {
            if (!this.currentLibrary) return 'Movie,Series';

            switch (this.currentLibrary.CollectionType) {
                case 'movies':
                    return 'Movie';
                case 'tvshows':
                    return 'Series';
                case 'music':
                    return 'MusicAlbum,MusicArtist';
                case 'boxsets':
                    return 'BoxSet';
                default:
                    return 'Movie,Series';
            }
        },

        /**
         * Render items to grid
         */
        renderItems: function(items, replace) {
            var grid = document.getElementById('library-grid');
            if (!grid) return;

            if (replace) {
                grid.innerHTML = '';
            }

            items.forEach(function(item) {
                var card = this.createMediaCard(item);
                grid.appendChild(card);
            }.bind(this));
        },

        /**
         * Create a media card element
         */
        createMediaCard: function(item) {
            var card = document.createElement('div');
            card.className = 'media-card focusable';
            card.tabIndex = 0;
            card.dataset.itemId = item.Id;
            card.dataset.itemType = item.Type;

            // Get image URL
            var imageUrl = this.getImageUrl(item);

            // Card content - meta uses innerHTML for rich formatting
            card.innerHTML =
                '<div class="card-image" style="background-image: url(\'' + imageUrl + '\')"></div>' +
                '<div class="card-info">' +
                    '<h3 class="card-title">' + this.escapeHtml(item.Name) + '</h3>' +
                    '<div class="card-meta">' + this.getCardMeta(item) + '</div>' +
                '</div>';

            // Store item data
            card._mediaData = item;

            // Click handler
            card.addEventListener('click', function() {
                this.handleCardClick(item);
            }.bind(this));

            return card;
        },

        /**
         * Get image URL for item
         */
        getImageUrl: function(item) {
            var serverUrl = window.StateManager.jellyfin.serverUrl;
            var imageType = item.ImageTags && item.ImageTags.Primary ? 'Primary' : 'Backdrop';

            if (item.ImageTags && item.ImageTags[imageType]) {
                return serverUrl + '/Items/' + item.Id + '/Images/' + imageType + '?maxWidth=300&quality=90';
            }

            // Fallback placeholder
            return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="450"%3E%3Crect fill="%23333" width="300" height="450"/%3E%3C/svg%3E';
        },

        /**
         * Get card metadata text
         */
        getCardMeta: function(item) {
            var meta = [];

            // Year
            if (item.ProductionYear) {
                meta.push('<span class="meta-year">' + item.ProductionYear + '</span>');
            }

            // Rotten Tomatoes score (CriticRating in Jellyfin)
            if (item.CriticRating) {
                var isFresh = item.CriticRating >= 60;
                var rtClass = isFresh ? 'fresh' : 'rotten';
                var rtIcon = isFresh ? '🍅' : '🤢';
                meta.push('<span class="rt-score ' + rtClass + '">' + rtIcon + ' ' + item.CriticRating + '%</span>');
            }

            // Community rating (IMDB style)
            if (item.CommunityRating) {
                meta.push('<span class="meta-rating">★ ' + item.CommunityRating.toFixed(1) + '</span>');
            }

            // Content rating (PG-13, R, TV-MA, etc.) for both movies and TV
            if (item.OfficialRating) {
                meta.push('<span class="meta-mpaa">' + item.OfficialRating + '</span>');
            }

            // Series-specific: season count and status
            if (item.Type === 'Series') {
                if (item.ChildCount) {
                    var seasonText = item.ChildCount === 1 ? '1 Season' : item.ChildCount + ' Seasons';
                    meta.push('<span class="meta-seasons">' + seasonText + '</span>');
                }
                if (item.Status) {
                    var statusClass = item.Status === 'Ended' ? 'ended' : 'continuing';
                    meta.push('<span class="meta-status ' + statusClass + '">' + (item.Status === 'Ended' ? 'Ended' : 'Continuing') + '</span>');
                }
            }

            return meta.join(' <span class="meta-dot">•</span> ') || item.Type;
        },

        /**
         * Handle card click
         */
        handleCardClick: function(item) {
            console.log('LibraryScreen: Card clicked', item.Name, item.Type);

            // Fetch full item details including Overview and RemoteTrailers
            var self = this;
            window.JellyfinClient.getItem(item.Id)
                .then(function(fullItem) {
                    console.log('LibraryScreen: Full item loaded', fullItem);
                    if (window.ModalManager) {
                        window.ModalManager.showDetails(fullItem, 'jellyfin');
                    }
                })
                .catch(function(error) {
                    console.error('LibraryScreen: Failed to load item details', error);
                    // Fall back to basic item data
                    if (window.ModalManager) {
                        window.ModalManager.showDetails(item, 'jellyfin');
                    }
                });
        },

        /**
         * Handle sort change
         */
        handleSortChange: function(value) {
            console.log('LibraryScreen: Sort changed to', value);

            var parts = value.split('-');
            this.sortBy = parts[0];
            this.sortOrder = parts[1] || 'Ascending';

            // Reload items with new sort
            this.currentPage = 0;
            this.currentItems = [];
            this.loadLibraryItems();
        },

        /**
         * Check if scrolled near bottom
         */
        isNearBottom: function(element) {
            var threshold = 200;
            return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
        },

        /**
         * Update item count display (disabled - count removed from UI)
         */
        updateItemCount: function() {
            // Count display removed from UI
        },

        /**
         * Show loading indicator
         */
        showLoading: function(show) {
            var loader = document.getElementById('library-loading');
            if (loader) {
                loader.style.display = show ? 'flex' : 'none';
            }
        },

        /**
         * Show empty state
         */
        showEmpty: function(message) {
            var grid = document.getElementById('library-grid');
            if (grid) {
                grid.innerHTML = '<p class="empty-message">' + message + '</p>';
            }
        },

        /**
         * Show error state
         */
        showError: function(message) {
            var grid = document.getElementById('library-grid');
            if (grid) {
                grid.innerHTML = '<p class="error-message">' + message + '</p>';
            }
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
    window.LibraryScreen = LibraryScreen;

})(window, document);
