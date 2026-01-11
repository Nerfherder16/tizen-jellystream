/**
 * JellyStream - Discover Screen
 * Browse trending, popular, and upcoming content from Jellyseerr
 * Separate sections for Movies and TV Shows
 */
(function(window, document) {
    'use strict';

    var DiscoverScreen = {
        initialized: false,
        currentSection: 'movies', // 'movies' or 'tv'
        currentCategory: 'trending',
        isLoading: false,
        selectedNetwork: null,

        // Movie categories
        movieCategories: {
            trending: { label: 'Trending', loader: 'loadTrendingMovies' },
            popular: { label: 'Popular', loader: 'loadPopularMovies' },
            upcoming: { label: 'Upcoming', loader: 'loadUpcomingMovies' }
        },

        // TV categories
        tvCategories: {
            trending: { label: 'Trending', loader: 'loadTrendingTv' },
            popular: { label: 'Popular', loader: 'loadPopularTv' },
            upcoming: { label: 'Upcoming', loader: 'loadUpcomingTv' },
            returning: { label: 'Returning Soon', loader: 'loadReturningShows' },
            networks: { label: 'Networks', loader: 'loadNetworks' }
        },

        /**
         * Initialize discover screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('DiscoverScreen: Initializing');

            this.bindEvents();
            this.initialized = true;

            console.log('DiscoverScreen: Initialized');
        },

        /**
         * Load discover screen content
         */
        load: function() {
            console.log('DiscoverScreen: Loading');

            // Check if Jellyseerr is connected
            if (!window.JellyseerrClient || !window.JellyseerrClient.isConfigured()) {
                this.showNotConnected();
                return;
            }

            // Render section tabs (Movies / TV)
            this.renderSectionTabs();

            // Render category tabs for current section
            this.renderCategoryTabs();

            // Load initial content
            this.loadCurrentCategory();

            // Focus first section tab after delay
            setTimeout(function() {
                var firstTab = document.querySelector('.discover-section-tab.focusable');
                if (firstTab && window.FocusManager) {
                    window.FocusManager.setFocus(firstTab);
                }
            }, 100);
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            var self = this;

            // Section tabs (Movies/TV)
            var sectionContainer = document.getElementById('discover-sections');
            if (sectionContainer) {
                sectionContainer.addEventListener('click', function(e) {
                    var tab = e.target.closest('.discover-section-tab');
                    if (tab) {
                        self.selectSection(tab.dataset.section);
                    }
                });
            }

            // Category tabs
            var tabsContainer = document.getElementById('discover-tabs');
            if (tabsContainer) {
                tabsContainer.addEventListener('click', function(e) {
                    var tab = e.target.closest('.discover-tab');
                    if (tab) {
                        self.selectCategory(tab.dataset.category);
                    }
                });
            }
        },

        /**
         * Render section tabs (Movies / TV Shows)
         */
        renderSectionTabs: function() {
            var container = document.getElementById('discover-sections');
            if (!container) return;

            var html = '';
            html += '<button class="discover-section-tab focusable' + (this.currentSection === 'movies' ? ' active' : '') + '" data-section="movies" tabindex="0">';
            html += '<span class="section-icon">🎬</span> Movies';
            html += '</button>';
            html += '<button class="discover-section-tab focusable' + (this.currentSection === 'tv' ? ' active' : '') + '" data-section="tv" tabindex="0">';
            html += '<span class="section-icon">📺</span> TV Shows';
            html += '</button>';

            container.innerHTML = html;
        },

        /**
         * Render category tabs for current section
         */
        renderCategoryTabs: function() {
            var container = document.getElementById('discover-tabs');
            if (!container) return;

            var categories = this.currentSection === 'movies' ? this.movieCategories : this.tvCategories;

            var html = '';
            for (var key in categories) {
                var isActive = key === this.currentCategory ? ' active' : '';
                html += '<button class="discover-tab focusable' + isActive + '" data-category="' + key + '" tabindex="0">';
                html += categories[key].label;
                html += '</button>';
            }

            container.innerHTML = html;
        },

        /**
         * Select a section (Movies or TV)
         */
        selectSection: function(section) {
            if (this.isLoading || section === this.currentSection) return;

            console.log('DiscoverScreen: Selecting section', section);

            this.currentSection = section;
            this.currentCategory = 'trending'; // Reset to trending
            this.selectedNetwork = null;

            // Update section tab active states
            var sectionTabs = document.querySelectorAll('.discover-section-tab');
            sectionTabs.forEach(function(tab) {
                tab.classList.toggle('active', tab.dataset.section === section);
            });

            // Re-render category tabs
            this.renderCategoryTabs();

            // Load content
            this.loadCurrentCategory();
        },

        /**
         * Select a category
         */
        selectCategory: function(category) {
            if (this.isLoading || category === this.currentCategory) return;

            console.log('DiscoverScreen: Selecting category', category);

            this.currentCategory = category;
            this.selectedNetwork = null;

            // Update tab active states
            var tabs = document.querySelectorAll('.discover-tab');
            tabs.forEach(function(tab) {
                tab.classList.toggle('active', tab.dataset.category === category);
            });

            // Load content
            this.loadCurrentCategory();
        },

        /**
         * Load content for current section and category
         */
        loadCurrentCategory: function() {
            var categories = this.currentSection === 'movies' ? this.movieCategories : this.tvCategories;
            var loaderName = categories[this.currentCategory].loader;
            if (this[loaderName]) {
                this[loaderName]();
            }
        },

        /**
         * Load trending movies
         */
        loadTrendingMovies: function() {
            var self = this;
            this.showLoading(true);

            // Use /discover/movies which returns trending movies
            window.JellyseerrClient.getTrendingMovies()
                .then(function(response) {
                    self.renderGrid(response.results || [], 'movie');
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Failed to load trending movies', error);
                    self.showError('Failed to load trending movies');
                    self.showLoading(false);
                });
        },

        /**
         * Load popular movies
         */
        loadPopularMovies: function() {
            var self = this;
            this.showLoading(true);

            // Try popular endpoint, fall back to discover/movies
            window.JellyseerrClient.getPopularMovies()
                .then(function(response) {
                    self.renderGrid(response.results || [], 'movie');
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Popular movies failed, trying discover', error);
                    // Fallback to regular discover which shows popular by default
                    window.JellyseerrClient.getTrendingMovies()
                        .then(function(response) {
                            self.renderGrid(response.results || [], 'movie');
                            self.showLoading(false);
                        })
                        .catch(function(err) {
                            self.showError('Failed to load popular movies');
                            self.showLoading(false);
                        });
                });
        },

        /**
         * Load upcoming movies
         */
        loadUpcomingMovies: function() {
            var self = this;
            this.showLoading(true);

            window.JellyseerrClient.getUpcomingMovies()
                .then(function(response) {
                    self.renderGrid(response.results || [], 'movie');
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Failed to load upcoming movies', error);
                    self.showError('Failed to load upcoming movies');
                    self.showLoading(false);
                });
        },

        /**
         * Load trending TV
         */
        loadTrendingTv: function() {
            var self = this;
            this.showLoading(true);

            // Use /discover/tv which returns trending TV
            window.JellyseerrClient.getTrendingTv()
                .then(function(response) {
                    self.renderGrid(response.results || [], 'tv');
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Failed to load trending TV', error);
                    self.showError('Failed to load trending TV');
                    self.showLoading(false);
                });
        },

        /**
         * Load popular TV
         */
        loadPopularTv: function() {
            var self = this;
            this.showLoading(true);

            // Try popular endpoint, fall back to discover/tv
            window.JellyseerrClient.getPopularTv()
                .then(function(response) {
                    self.renderGrid(response.results || [], 'tv');
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Popular TV failed, trying discover', error);
                    window.JellyseerrClient.getTrendingTv()
                        .then(function(response) {
                            self.renderGrid(response.results || [], 'tv');
                            self.showLoading(false);
                        })
                        .catch(function(err) {
                            self.showError('Failed to load popular TV shows');
                            self.showLoading(false);
                        });
                });
        },

        /**
         * Load upcoming TV
         */
        loadUpcomingTv: function() {
            var self = this;
            this.showLoading(true);

            window.JellyseerrClient.getUpcomingTv()
                .then(function(response) {
                    self.renderGrid(response.results || [], 'tv');
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Failed to load upcoming TV', error);
                    self.showError('Failed to load upcoming TV shows');
                    self.showLoading(false);
                });
        },

        /**
         * Load returning shows (shows in library with upcoming episodes)
         */
        loadReturningShows: function() {
            var self = this;
            this.showLoading(true);

            // Get shows from Jellyfin library, then check Jellyseerr for upcoming
            if (!window.JellyfinClient) {
                self.showError('Jellyfin not connected');
                self.showLoading(false);
                return;
            }

            // Get TV series from Jellyfin
            window.JellyfinClient.getItems({
                IncludeItemTypes: 'Series',
                Recursive: true,
                SortBy: 'DateLastContentAdded',
                SortOrder: 'Descending',
                Limit: 50,
                Fields: 'ProviderIds,Overview'
            })
                .then(function(response) {
                    var series = response.Items || [];
                    console.log('Discover: Found', series.length, 'series in library');

                    // Filter to shows that might have upcoming episodes
                    // Check each show's status via Jellyseerr
                    var checkPromises = series.slice(0, 20).map(function(show) {
                        var tmdbId = show.ProviderIds && show.ProviderIds.Tmdb;
                        if (!tmdbId) return Promise.resolve(null);

                        return window.JellyseerrClient.getTvShow(tmdbId)
                            .then(function(details) {
                                // Check if show is returning (status = "Returning Series")
                                if (details.status === 'Returning Series' || details.inProduction) {
                                    return {
                                        id: details.id,
                                        name: details.name,
                                        posterPath: details.posterPath,
                                        firstAirDate: details.firstAirDate,
                                        voteAverage: details.voteAverage,
                                        mediaType: 'tv',
                                        nextEpisodeToAir: details.nextEpisodeToAir,
                                        status: details.status,
                                        jellyfinId: show.Id
                                    };
                                }
                                return null;
                            })
                            .catch(function() {
                                return null;
                            });
                    });

                    return Promise.all(checkPromises);
                })
                .then(function(results) {
                    var returning = results.filter(function(item) {
                        return item !== null;
                    });

                    // Sort by next episode date if available
                    returning.sort(function(a, b) {
                        var dateA = a.nextEpisodeToAir ? a.nextEpisodeToAir.airDate : '9999';
                        var dateB = b.nextEpisodeToAir ? b.nextEpisodeToAir.airDate : '9999';
                        return dateA.localeCompare(dateB);
                    });

                    console.log('Discover: Found', returning.length, 'returning shows');
                    self.renderReturningGrid(returning);
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Failed to load returning shows', error);
                    self.showError('Failed to load returning shows');
                    self.showLoading(false);
                });
        },

        /**
         * Load networks grid
         */
        loadNetworks: function() {
            var self = this;
            this.showLoading(true);

            window.JellyseerrClient.getNetworks()
                .then(function(networks) {
                    self.renderNetworksGrid(networks);
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Failed to load networks', error);
                    self.showError('Failed to load networks');
                    self.showLoading(false);
                });
        },

        /**
         * Load shows for a specific network
         */
        loadNetworkShows: function(networkId, networkName) {
            var self = this;
            this.showLoading(true);
            this.selectedNetwork = { id: networkId, name: networkName };

            window.JellyseerrClient.getTvByNetwork(networkId)
                .then(function(response) {
                    self.renderGrid(response.results || [], 'tv', networkName);
                    self.showLoading(false);
                })
                .catch(function(error) {
                    console.error('Discover: Failed to load network shows', error);
                    self.showError('Failed to load ' + networkName + ' shows');
                    self.showLoading(false);
                });
        },

        /**
         * Render content grid
         */
        renderGrid: function(items, mediaType, subtitle) {
            var container = document.getElementById('discover-grid');
            if (!container) return;

            // Add back button if viewing network
            var headerHtml = '';
            if (this.selectedNetwork) {
                headerHtml = '<div class="discover-grid-header">' +
                    '<button class="discover-back-btn focusable" id="discover-back-btn">← Back to Networks</button>' +
                    '<h3>' + this.escapeHtml(this.selectedNetwork.name) + '</h3>' +
                    '</div>';
            }

            if (items.length === 0) {
                container.innerHTML = headerHtml + '<p class="discover-empty">No content found</p>';
                this.bindBackButton();
                return;
            }

            var html = headerHtml;
            items.forEach(function(item) {
                html += this.createCard(item, mediaType);
            }.bind(this));

            container.innerHTML = html;

            // Bind card events
            this.bindCardEvents();
            this.bindBackButton();

            // Update count
            var countEl = document.getElementById('discover-count');
            if (countEl) {
                countEl.textContent = items.length + ' items';
            }
        },

        /**
         * Render returning shows grid with next episode info
         */
        renderReturningGrid: function(items) {
            var container = document.getElementById('discover-grid');
            if (!container) return;

            if (items.length === 0) {
                container.innerHTML = '<p class="discover-empty">No returning shows found in your library</p>';
                return;
            }

            var html = '';
            items.forEach(function(item) {
                html += this.createReturningCard(item);
            }.bind(this));

            container.innerHTML = html;

            // Bind card events
            this.bindCardEvents();

            // Update count
            var countEl = document.getElementById('discover-count');
            if (countEl) {
                countEl.textContent = items.length + ' returning shows';
            }
        },

        /**
         * Render networks grid
         */
        renderNetworksGrid: function(networks) {
            var self = this;
            var container = document.getElementById('discover-grid');
            if (!container) return;

            var html = '<div class="discover-networks">';
            networks.forEach(function(network) {
                html += '<button class="discover-network-btn focusable" data-network-id="' + network.id + '" data-network-name="' + self.escapeHtml(network.name) + '" tabindex="0">';
                html += '<span class="network-name">' + self.escapeHtml(network.name) + '</span>';
                html += '</button>';
            });
            html += '</div>';

            container.innerHTML = html;

            // Bind network button events
            var networkBtns = container.querySelectorAll('.discover-network-btn');
            networkBtns.forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var networkId = parseInt(this.dataset.networkId, 10);
                    var networkName = this.dataset.networkName;
                    self.loadNetworkShows(networkId, networkName);
                });
            });

            // Update count
            var countEl = document.getElementById('discover-count');
            if (countEl) {
                countEl.textContent = networks.length + ' networks';
            }
        },

        /**
         * Bind back button for network view
         */
        bindBackButton: function() {
            var self = this;
            var backBtn = document.getElementById('discover-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', function() {
                    self.selectedNetwork = null;
                    self.loadNetworks();
                });
            }
        },

        /**
         * Create a card element
         */
        createCard: function(item, defaultMediaType) {
            var posterUrl = item.posterPath
                ? 'https://image.tmdb.org/t/p/w500' + item.posterPath
                : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23333" width="200" height="300"/%3E%3C/svg%3E';

            var title = item.title || item.name || 'Unknown';
            var mediaType = item.mediaType || defaultMediaType || (item.title ? 'movie' : 'tv');
            var year = this.getYear(item);
            var rating = item.voteAverage ? item.voteAverage.toFixed(1) : null;

            // Status badge
            var statusBadge = '';
            if (item.mediaInfo) {
                var status = item.mediaInfo.status;
                if (status === 5) {
                    statusBadge = '<span class="status-badge status-available">Available</span>';
                } else if (status >= 2) {
                    statusBadge = '<span class="status-badge status-requested">Requested</span>';
                }
            }

            var html = '<div class="discover-card focusable" tabindex="0" ';
            html += 'data-tmdb-id="' + item.id + '" ';
            html += 'data-media-type="' + mediaType + '">';
            html += '<div class="discover-card-image" style="background-image: url(\'' + posterUrl + '\')">';
            html += statusBadge;
            html += '</div>';
            html += '<div class="discover-card-info">';
            html += '<h3 class="discover-card-title">' + this.escapeHtml(title) + '</h3>';
            html += '<p class="discover-card-meta">';
            if (year) html += year;
            if (rating) html += (year ? ' • ' : '') + '<span class="rating-star">★</span> ' + rating;
            html += '</p>';
            html += '</div>';
            html += '</div>';

            return html;
        },

        /**
         * Create a returning show card with next episode info
         */
        createReturningCard: function(item) {
            var posterUrl = item.posterPath
                ? 'https://image.tmdb.org/t/p/w500' + item.posterPath
                : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23333" width="200" height="300"/%3E%3C/svg%3E';

            var title = item.name || 'Unknown';

            // Next episode info
            var nextEpInfo = '';
            if (item.nextEpisodeToAir) {
                var ep = item.nextEpisodeToAir;
                var airDate = new Date(ep.airDate);
                var now = new Date();
                var daysUntil = Math.ceil((airDate - now) / (1000 * 60 * 60 * 24));

                var dateStr = '';
                if (daysUntil === 0) {
                    dateStr = 'Today';
                } else if (daysUntil === 1) {
                    dateStr = 'Tomorrow';
                } else if (daysUntil > 0 && daysUntil <= 7) {
                    dateStr = 'In ' + daysUntil + ' days';
                } else if (daysUntil > 0) {
                    dateStr = airDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                } else {
                    dateStr = 'TBA';
                }

                nextEpInfo = '<div class="next-episode-info">' +
                    '<span class="next-ep-label">S' + ep.seasonNumber + 'E' + ep.episodeNumber + '</span>' +
                    '<span class="next-ep-date">' + dateStr + '</span>' +
                    '</div>';
            } else {
                nextEpInfo = '<div class="next-episode-info"><span class="next-ep-date">New Season TBA</span></div>';
            }

            var html = '<div class="discover-card discover-card-returning focusable" tabindex="0" ';
            html += 'data-tmdb-id="' + item.id + '" ';
            html += 'data-jellyfin-id="' + (item.jellyfinId || '') + '" ';
            html += 'data-media-type="tv">';
            html += '<div class="discover-card-image" style="background-image: url(\'' + posterUrl + '\')">';
            html += '<span class="status-badge status-in-library">In Library</span>';
            html += '</div>';
            html += '<div class="discover-card-info">';
            html += '<h3 class="discover-card-title">' + this.escapeHtml(title) + '</h3>';
            html += nextEpInfo;
            html += '</div>';
            html += '</div>';

            return html;
        },

        /**
         * Get year from item
         */
        getYear: function(item) {
            var date = item.releaseDate || item.firstAirDate;
            if (date) {
                return date.substring(0, 4);
            }
            return null;
        },

        /**
         * Bind card click events
         */
        bindCardEvents: function() {
            var self = this;
            var cards = document.querySelectorAll('.discover-card');

            cards.forEach(function(card) {
                card.addEventListener('click', function() {
                    var tmdbId = parseInt(this.dataset.tmdbId, 10);
                    var mediaType = this.dataset.mediaType;
                    var jellyfinId = this.dataset.jellyfinId;
                    self.handleCardClick(tmdbId, mediaType, jellyfinId);
                });
            });
        },

        /**
         * Handle card click - show details
         */
        handleCardClick: function(tmdbId, mediaType, jellyfinId) {
            console.log('DiscoverScreen: Card clicked', tmdbId, mediaType, jellyfinId);

            var self = this;

            // If we have a Jellyfin ID, open directly in Jellyfin
            if (jellyfinId && window.ModalManager) {
                window.JellyfinClient.getItem(jellyfinId)
                    .then(function(item) {
                        window.ModalManager.showDetails(item, 'jellyfin');
                    })
                    .catch(function(error) {
                        console.error('DiscoverScreen: Failed to load Jellyfin item', error);
                        // Fall back to Jellyseerr
                        self.loadJellyseerrDetails(tmdbId, mediaType);
                    });
                return;
            }

            // Fetch from Jellyseerr
            this.loadJellyseerrDetails(tmdbId, mediaType);
        },

        /**
         * Load details from Jellyseerr
         */
        loadJellyseerrDetails: function(tmdbId, mediaType) {
            var self = this;

            window.JellyseerrClient.getMediaDetails(mediaType, tmdbId)
                .then(function(details) {
                    console.log('DiscoverScreen: Details loaded', details);

                    // Show in modal
                    if (window.ModalManager) {
                        window.ModalManager.showDetails(details, 'jellyseerr');
                    }
                })
                .catch(function(error) {
                    console.error('DiscoverScreen: Failed to load details', error);
                    self.showToast('Failed to load details');
                });
        },

        /**
         * Show not connected message
         */
        showNotConnected: function() {
            var container = document.getElementById('discover-content');
            if (container) {
                container.innerHTML =
                    '<div class="discover-not-connected">' +
                    '<h2>Jellyseerr Not Connected</h2>' +
                    '<p>Connect to Jellyseerr to discover trending and popular content.</p>' +
                    '<p class="hint">You can configure Jellyseerr in Settings.</p>' +
                    '</div>';
            }
        },

        /**
         * Show loading state
         */
        showLoading: function(show) {
            this.isLoading = show;
            var loader = document.getElementById('discover-loading');
            if (loader) {
                loader.style.display = show ? 'flex' : 'none';
            }

            var grid = document.getElementById('discover-grid');
            if (grid && show) {
                grid.innerHTML = '';
            }
        },

        /**
         * Show error message
         */
        showError: function(message) {
            var container = document.getElementById('discover-grid');
            if (container) {
                container.innerHTML = '<p class="discover-error">' + message + '</p>';
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
    window.DiscoverScreen = DiscoverScreen;

})(window, document);
