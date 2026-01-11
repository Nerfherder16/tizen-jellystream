/**
 * JellyStream - Home Screen
 * Main dashboard with continue watching, trending, and recently added content
 */
(function(window, document) {
    'use strict';

    var HomeScreen = {
        initialized: false,

        /**
         * Initialize home screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('HomeScreen: Initializing');
            this.initialized = true;
        },

        /**
         * Load home screen content
         */
        load: function() {
            console.log('HomeScreen: Loading content');

            // Update user name
            this.updateUserInfo();

            // Load content sections
            this.loadContinueWatching();
            this.loadTrending();
            this.loadRecentlyAdded();

            // Initialize focus after a short delay to let content render
            setTimeout(function() {
                if (window.FocusManager) {
                    window.FocusManager.focusFirst();
                }
            }, 500);
        },

        /**
         * Update user info display
         */
        updateUserInfo: function() {
            var userName = window.StateManager.jellyfin.userName || 'User';
            var userNameElement = document.getElementById('user-name');
            if (userNameElement) {
                userNameElement.textContent = 'Welcome, ' + userName;
            }
        },

        /**
         * Load continue watching section
         */
        loadContinueWatching: function() {
            var container = document.getElementById('continue-watching-row');
            if (!container) return;

            console.log('HomeScreen: Loading continue watching...');

            window.JellyfinClient.getResumeItems(12)
                .then(function(response) {
                    console.log('Continue watching loaded:', response);

                    if (response.Items && response.Items.length > 0) {
                        this.renderMediaCards(container, response.Items);
                    } else {
                        container.innerHTML = '<p class="empty-message">Nothing to resume</p>';
                    }
                }.bind(this))
                .catch(function(error) {
                    console.error('Failed to load continue watching:', error);
                    container.innerHTML = '<p class="error-message">Failed to load content</p>';
                });
        },

        /**
         * Load trending content from Jellyseerr
         */
        loadTrending: function() {
            var container = document.getElementById('trending-row');
            if (!container) return;

            console.log('HomeScreen: Loading trending...');

            // Check if Jellyseerr is connected
            if (!window.StateManager.jellyseerr.connected) {
                container.innerHTML = '<p class="empty-message">Connect Jellyseerr to see trending content</p>';
                return;
            }

            window.JellyseerrClient.getTrending()
                .then(function(response) {
                    console.log('Trending loaded:', response);

                    if (response.results && response.results.length > 0) {
                        this.renderTrendingCards(container, response.results);
                    } else {
                        container.innerHTML = '<p class="empty-message">No trending content</p>';
                    }
                }.bind(this))
                .catch(function(error) {
                    console.error('Failed to load trending:', error);
                    container.innerHTML = '<p class="error-message">Failed to load trending</p>';
                });
        },

        /**
         * Load recently added content from Jellyfin
         */
        loadRecentlyAdded: function() {
            var container = document.getElementById('recently-added-row');
            if (!container) return;

            console.log('HomeScreen: Loading recently added...');

            window.JellyfinClient.getItems({
                sortBy: 'DateCreated',
                sortOrder: 'Descending',
                recursive: true,
                limit: 12,
                includeItemTypes: 'Movie,Series',
                fields: 'PrimaryImageAspectRatio'
            })
                .then(function(response) {
                    console.log('Recently added loaded:', response);

                    if (response.Items && response.Items.length > 0) {
                        this.renderMediaCards(container, response.Items);
                    } else {
                        container.innerHTML = '<p class="empty-message">No recent content</p>';
                    }
                }.bind(this))
                .catch(function(error) {
                    console.error('Failed to load recently added:', error);
                    container.innerHTML = '<p class="error-message">Failed to load content</p>';
                });
        },

        /**
         * Render Jellyfin media cards
         */
        renderMediaCards: function(container, items) {
            container.innerHTML = '';

            items.forEach(function(item) {
                var card = this.createMediaCard(item);
                container.appendChild(card);
            }.bind(this));
        },

        /**
         * Create a media card element
         */
        createMediaCard: function(item) {
            var card = document.createElement('div');
            card.className = 'media-card';
            card.tabIndex = 0; // Make focusable
            card.dataset.itemId = item.Id;
            card.dataset.source = 'jellyfin';

            // Get image URL
            var imageUrl = this.getImageUrl(item);

            // Build progress bar HTML if applicable
            var progressHtml = '';
            if (item.UserData && item.UserData.PlayedPercentage && item.UserData.PlayedPercentage > 0) {
                var percent = Math.round(item.UserData.PlayedPercentage);
                progressHtml = '<div class="card-progress"><div class="card-progress-bar" style="width: ' + percent + '%"></div></div>';
            }

            // Watched badge
            var watchedHtml = '';
            if (item.UserData && item.UserData.Played) {
                watchedHtml = '<div class="card-watched-badge">&#10003;</div>';
            }

            // Card content
            card.innerHTML =
                '<div class="card-image" style="background-image: url(' + imageUrl + ')">' +
                    progressHtml +
                    watchedHtml +
                '</div>' +
                '<div class="card-info">' +
                    '<h3 class="card-title">' + this.escapeHtml(item.Name) + '</h3>' +
                    '<p class="card-meta">' + this.getCardMeta(item) + '</p>' +
                '</div>';

            // Store item data for modal
            card._mediaData = item;

            // Click handler
            card.addEventListener('click', function() {
                this.handleCardClick(item, 'jellyfin');
            }.bind(this));

            return card;
        },

        /**
         * Render Jellyseerr trending cards
         */
        renderTrendingCards: function(container, items) {
            container.innerHTML = '';

            items.forEach(function(item) {
                var card = this.createTrendingCard(item);
                container.appendChild(card);
            }.bind(this));
        },

        /**
         * Create a trending card element
         */
        createTrendingCard: function(item) {
            var card = document.createElement('div');
            card.className = 'media-card';
            card.tabIndex = 0; // Make focusable
            card.dataset.tmdbId = item.id;
            card.dataset.source = 'jellyseerr';

            // TMDb poster URL
            var posterUrl = item.posterPath
                ? 'https://image.tmdb.org/t/p/w500' + item.posterPath
                : '';

            card.innerHTML =
                '<div class="card-image" style="background-image: url(' + posterUrl + ')"></div>' +
                '<div class="card-info">' +
                    '<h3 class="card-title">' + this.escapeHtml(item.title || item.name) + '</h3>' +
                    '<p class="card-meta">' + (item.mediaType === 'movie' ? 'Movie' : 'TV') + '</p>' +
                '</div>';

            // Store item data for modal
            card._mediaData = item;

            // Click handler
            var self = this;
            card.addEventListener('click', function() {
                self.handleCardClick(item, 'jellyseerr');
            });

            return card;
        },

        /**
         * Get image URL for Jellyfin item
         */
        getImageUrl: function(item) {
            var serverUrl = window.StateManager.jellyfin.serverUrl;
            var itemId = item.Id;
            var imageType = item.ImageTags && item.ImageTags.Primary ? 'Primary' : 'Backdrop';

            if (item.ImageTags && item.ImageTags[imageType]) {
                return serverUrl + '/Items/' + itemId + '/Images/' + imageType + '?maxWidth=400&quality=90';
            }

            return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="450"%3E%3Crect fill="%23333" width="300" height="450"/%3E%3C/svg%3E';
        },

        /**
         * Get card metadata text
         */
        getCardMeta: function(item) {
            var meta = [];

            if (item.ProductionYear) {
                meta.push(item.ProductionYear);
            }

            if (item.Type === 'Episode' && item.SeriesName) {
                meta.push(item.SeriesName);
            }

            if (item.UserData && item.UserData.PlayedPercentage) {
                meta.push(Math.round(item.UserData.PlayedPercentage) + '% watched');
            }

            return meta.join(' • ') || 'Media';
        },

        /**
         * Handle card click
         */
        handleCardClick: function(item, source) {
            console.log('Media clicked:', item.Name || item.title, source);

            // Show details modal
            if (window.ModalManager) {
                window.ModalManager.showDetails(item, source);
            } else {
                console.error('ModalManager not available');
            }
        },

        /**
         * Escape HTML to prevent XSS
         */
        escapeHtml: function(text) {
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // Export to global scope
    window.HomeScreen = HomeScreen;

})(window, document);
