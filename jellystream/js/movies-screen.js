/**
 * JellyStream - Movies Screen
 * Browse trending, popular, and upcoming movies from Trakt
 */
(function(window, document) {
    'use strict';

    var MoviesScreen = {
        initialized: false,
        currentCategory: 'trending',
        isLoading: false,
        currentPage: 1,
        totalPages: 1,
        currentItems: [],

        // Cached filter data
        genres: null,

        // Trakt user data for indicators
        watchedIds: null,
        watchlistIds: null,

        // Current filters
        filters: {
            genres: null
        },

        // Movie categories
        categories: {
            trending: { label: 'Trending', loader: 'loadTrending' },
            popular: { label: 'Popular', loader: 'loadPopular' },
            watched: { label: 'Most Watched', loader: 'loadMostWatched' },
            boxoffice: { label: 'Box Office', loader: 'loadBoxOffice' },
            forYou: { label: 'For You', loader: 'loadRecommended', requiresAuth: true },
            anticipated: { label: 'Coming Soon', loader: 'loadAnticipated' }
        },

        /**
         * Initialize movies screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('MoviesScreen: Initializing');

            this.bindEvents();
            this.initialized = true;

            console.log('MoviesScreen: Initialized');
        },

        /**
         * Load movies screen content
         */
        load: function() {
            console.log('MoviesScreen: Loading');

            var self = this;

            // Load filter data first (genres), then render
            this.loadFilterData().then(function() {
                // Render category tabs
                self.renderCategoryTabs();

                // Render filter dropdowns
                self.renderFilters();

                // Load initial content
                self.loadCurrentCategory();

                // Focus first category tab after delay
                setTimeout(function() {
                    var firstTab = document.querySelector('#movies-tabs .movies-tab.focusable');
                    if (firstTab && window.FocusManager) {
                        window.FocusManager.setFocus(firstTab);
                    }
                }, 100);
            });
        },

        /**
         * Load genre data for filters and Trakt user data for indicators
         */
        loadFilterData: function() {
            var self = this;
            var promises = [];

            // Load genres if not cached
            if (!this.genres) {
                promises.push(
                    window.TraktClient.getMovieGenres()
                        .then(function(genres) {
                            self.genres = genres || [];
                        })
                        .catch(function() { self.genres = []; })
                );
            }

            // Always refresh watched/watchlist IDs from Trakt (don't use stale cache)
            if (window.TraktClient.isAuthenticated()) {
                promises.push(
                    window.TraktClient.getWatchedMovieIds()
                        .then(function(ids) {
                            self.watchedIds = ids;
                            console.log('MoviesScreen: Loaded', ids.size, 'watched movie IDs');
                        })
                        .catch(function() { self.watchedIds = new Set(); })
                );

                promises.push(
                    window.TraktClient.getMovieWatchlistIds()
                        .then(function(ids) {
                            self.watchlistIds = ids;
                            console.log('MoviesScreen: Loaded', ids.size, 'watchlist movie IDs');
                        })
                        .catch(function() { self.watchlistIds = new Set(); })
                );
            }

            return Promise.all(promises);
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            var self = this;

            // Category tabs
            var tabsContainer = document.getElementById('movies-tabs');
            if (tabsContainer) {
                tabsContainer.addEventListener('click', function(e) {
                    var tab = e.target.closest('.movies-tab');
                    if (tab) {
                        self.selectCategory(tab.dataset.category);
                    }
                });
            }

            // Filter changes
            var filtersContainer = document.getElementById('movies-filters');
            if (filtersContainer) {
                filtersContainer.addEventListener('change', function(e) {
                    if (e.target.id === 'movies-genre-filter') {
                        self.filters.genres = e.target.value || null;
                        self.applyFilters();
                    }
                });
            }
        },

        /**
         * Render category tabs
         */
        renderCategoryTabs: function() {
            var container = document.getElementById('movies-tabs');
            if (!container) return;

            var isAuthenticated = window.TraktClient && window.TraktClient.isAuthenticated();

            var html = '';
            for (var key in this.categories) {
                // Skip "For You" if not authenticated
                if (this.categories[key].requiresAuth && !isAuthenticated) continue;

                var isActive = key === this.currentCategory ? ' active' : '';
                html += '<button class="movies-tab focusable' + isActive + '" data-category="' + key + '" tabindex="0">';
                html += this.categories[key].label;
                html += '</button>';
            }

            container.innerHTML = html;
        },

        /**
         * Render filter dropdowns
         */
        renderFilters: function() {
            var container = document.getElementById('movies-filters');
            if (!container) return;

            var html = '<div class="filter-row">';

            // Genre filter
            html += '<div class="filter-group">';
            html += '<label for="movies-genre-filter">Genre</label>';
            html += '<select id="movies-genre-filter" class="filter-select focusable" tabindex="0">';
            html += '<option value="">All Genres</option>';
            if (this.genres) {
                this.genres.forEach(function(genre) {
                    var selected = this.filters.genres === genre.slug ? ' selected' : '';
                    html += '<option value="' + genre.slug + '"' + selected + '>' + genre.name + '</option>';
                }.bind(this));
            }
            html += '</select>';
            html += '</div>';

            html += '</div>';

            container.innerHTML = html;
        },

        /**
         * Apply current filters and reload
         */
        applyFilters: function() {
            this.currentPage = 1;
            this.currentItems = [];
            this.loadCurrentCategory();
        },

        /**
         * Select a category
         */
        selectCategory: function(category) {
            if (this.isLoading || category === this.currentCategory) return;

            console.log('MoviesScreen: Selecting category', category);

            this.currentCategory = category;
            this.currentPage = 1;
            this.totalPages = 1;
            this.currentItems = [];

            // Update tab active states
            var tabs = document.querySelectorAll('.movies-tab');
            tabs.forEach(function(tab) {
                tab.classList.toggle('active', tab.dataset.category === category);
            });

            // Load content
            this.loadCurrentCategory();
        },

        /**
         * Load content for current category
         */
        loadCurrentCategory: function() {
            var loaderName = this.categories[this.currentCategory].loader;
            if (this[loaderName]) {
                this[loaderName]();
            }
        },

        /**
         * Get current filter object for API calls
         */
        getCurrentFilters: function() {
            var filters = {};
            if (this.filters.genres) filters.genres = this.filters.genres;
            return Object.keys(filters).length > 0 ? filters : null;
        },

        // ==================== LOADERS ====================

        loadTrending: function(append) {
            var self = this;
            this.showLoading(true, append);
            var page = append ? this.currentPage + 1 : 1;

            window.TraktClient.getTrendingMovies(page, 20, this.getCurrentFilters())
                .then(function(response) {
                    self.handleResponse(response, append);
                })
                .catch(function(error) {
                    console.error('Movies: Failed to load trending', error);
                    self.showError('Failed to load trending movies');
                    self.showLoading(false);
                });
        },

        loadPopular: function(append) {
            var self = this;
            this.showLoading(true, append);
            var page = append ? this.currentPage + 1 : 1;

            window.TraktClient.getPopularMovies(page, 20, this.getCurrentFilters())
                .then(function(response) {
                    self.handleResponse(response, append);
                })
                .catch(function(error) {
                    console.error('Movies: Failed to load popular', error);
                    self.showError('Failed to load popular movies');
                    self.showLoading(false);
                });
        },

        loadAnticipated: function(append) {
            var self = this;
            this.showLoading(true, append);
            var page = append ? this.currentPage + 1 : 1;

            window.TraktClient.getAnticipatedMovies(page, 20, this.getCurrentFilters())
                .then(function(response) {
                    self.handleResponse(response, append, true);
                })
                .catch(function(error) {
                    console.error('Movies: Failed to load anticipated', error);
                    self.showError('Failed to load anticipated movies');
                    self.showLoading(false);
                });
        },

        loadMostWatched: function(append) {
            var self = this;
            this.showLoading(true, append);
            var page = append ? this.currentPage + 1 : 1;

            window.TraktClient.getMostWatchedMovies('weekly', page, 20, this.getCurrentFilters())
                .then(function(response) {
                    self.handleResponse(response, append);
                })
                .catch(function(error) {
                    console.error('Movies: Failed to load most watched', error);
                    self.showError('Failed to load most watched movies');
                    self.showLoading(false);
                });
        },

        loadBoxOffice: function(append) {
            var self = this;
            this.showLoading(true, append);

            window.TraktClient.getBoxOfficeMovies()
                .then(function(response) {
                    self.handleResponse(response, false);
                    self.totalPages = 1;
                })
                .catch(function(error) {
                    console.error('Movies: Failed to load box office', error);
                    self.showError('Failed to load box office movies');
                    self.showLoading(false);
                });
        },

        loadRecommended: function(append) {
            var self = this;
            this.showLoading(true, append);
            var page = append ? this.currentPage + 1 : 1;

            window.TraktClient.getRecommendedMovies(page, 20)
                .then(function(response) {
                    self.handleResponse(response, append);
                })
                .catch(function(error) {
                    console.error('Movies: Failed to load recommended', error);
                    if (error.message && error.message.includes('426')) {
                        self.showError('Recommendations require Trakt VIP');
                    } else {
                        self.showError('Failed to load recommendations');
                    }
                    self.showLoading(false);
                });
        },

        // ==================== RESPONSE HANDLING ====================

        handleResponse: function(response, append, isAnticipated) {
            var items = response || [];

            var normalizedItems = items.map(function(item) {
                var mediaItem = item.movie || item;
                return {
                    trakt: mediaItem,
                    watchers: item.watchers,
                    list_count: item.list_count,
                    watcher_count: item.watcher_count,
                    revenue: item.revenue,
                    isAnticipated: isAnticipated
                };
            });

            this.currentPage = append ? this.currentPage + 1 : 1;
            this.totalPages = items.length === 20 ? this.currentPage + 1 : this.currentPage;

            if (append) {
                this.currentItems = this.currentItems.concat(normalizedItems);
            } else {
                this.currentItems = normalizedItems;
            }

            this.renderGrid(this.currentItems, append);
            this.showLoading(false);
        },

        loadMore: function() {
            if (this.isLoading || this.currentPage >= this.totalPages) return;

            var loaderName = this.categories[this.currentCategory].loader;
            if (this[loaderName]) {
                this[loaderName](true);
            }
        },

        // ==================== RENDERING ====================

        renderGrid: function(items, isAppend) {
            var container = document.getElementById('movies-grid');
            if (!container) return;

            if (items.length === 0) {
                container.innerHTML = '<p class="movies-empty">No movies found</p>';
                return;
            }

            var html = '';
            items.forEach(function(item) {
                html += this.createCard(item);
            }.bind(this));

            if (this.currentPage < this.totalPages) {
                html += '<div class="movies-load-more-container">';
                html += '<button class="movies-load-more-btn focusable" id="movies-load-more-btn" tabindex="0">';
                html += 'Load More';
                html += '</button>';
                html += '</div>';
            }

            container.innerHTML = html;

            this.bindCardEvents();
            this.bindLoadMoreButton();

            var countEl = document.getElementById('movies-count');
            if (countEl) {
                countEl.textContent = items.length + ' movies';
            }
        },

        createCard: function(item) {
            var trakt = item.trakt;
            var tmdbId = trakt.ids ? trakt.ids.tmdb : null;
            var traktId = trakt.ids ? trakt.ids.trakt : null;

            var title = trakt.title || 'Unknown';
            var year = trakt.year;
            var rating = trakt.rating ? trakt.rating.toFixed(1) : null;

            var countdownPill = '';
            if (item.isAnticipated && trakt.released) {
                var daysUntil = this.getDaysUntilRelease(trakt.released);
                if (daysUntil !== null && daysUntil >= 0) {
                    countdownPill = this.createCountdownPill(daysUntil);
                }
            }

            var statsPill = '';
            if (item.watchers) {
                statsPill = '<span class="card-stat-pill watchers">' + item.watchers + ' watching</span>';
            } else if (item.list_count) {
                statsPill = '<span class="card-stat-pill lists">' + item.list_count.toLocaleString() + ' lists</span>';
            }

            // Trakt indicator badges
            var traktBadge = '';
            if (traktId && this.watchedIds && this.watchedIds.has(traktId)) {
                traktBadge = '<div class="card-trakt-badge watched">' +
                    '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' +
                '</div>';
            } else if (traktId && this.watchlistIds && this.watchlistIds.has(traktId)) {
                traktBadge = '<div class="card-trakt-badge watchlist">' +
                    '<svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>' +
                '</div>';
            }

            var html = '<div class="movies-card focusable" tabindex="0" ';
            html += 'data-tmdb-id="' + (tmdbId || '') + '" ';
            html += 'data-trakt-id="' + (traktId || '') + '">';
            html += '<div class="movies-card-image" data-tmdb-id="' + tmdbId + '">';
            html += traktBadge;
            html += countdownPill;
            html += statsPill;
            html += '</div>';
            html += '<div class="movies-card-info">';
            html += '<h3 class="movies-card-title">' + this.escapeHtml(title) + '</h3>';
            html += '<p class="movies-card-meta">';
            if (year) html += year;
            if (rating) html += (year ? ' • ' : '') + '<span class="rating-star">★</span> ' + rating;
            html += '</p>';
            html += '</div>';
            html += '</div>';

            return html;
        },

        getDaysUntilRelease: function(dateString) {
            if (!dateString) return null;
            var releaseDate = new Date(dateString);
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            releaseDate.setHours(0, 0, 0, 0);
            var diffTime = releaseDate - today;
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        },

        createCountdownPill: function(days) {
            var text, className;
            if (days === 0) {
                text = 'today';
                className = 'countdown-today';
            } else if (days === 1) {
                text = 'tomorrow';
                className = 'countdown-tomorrow';
            } else if (days <= 7) {
                text = 'in ' + days + ' days';
                className = 'countdown-soon';
            } else if (days <= 30) {
                text = 'in ' + days + ' days';
                className = 'countdown-month';
            } else if (days <= 90) {
                var weeks = Math.round(days / 7);
                text = 'in ' + weeks + ' weeks';
                className = 'countdown-later';
            } else {
                var months = Math.round(days / 30);
                text = 'in ' + months + ' months';
                className = 'countdown-later';
            }
            return '<span class="countdown-pill ' + className + '">' + text + '</span>';
        },

        bindCardEvents: function() {
            var self = this;
            var cards = document.querySelectorAll('.movies-card');

            cards.forEach(function(card) {
                var imageEl = card.querySelector('.movies-card-image');
                if (imageEl) {
                    var tmdbId = imageEl.dataset.tmdbId;
                    if (tmdbId && tmdbId !== 'null' && window.TMDBClient) {
                        self.loadPoster(imageEl, tmdbId);
                    }
                }

                card.addEventListener('click', function() {
                    var tmdbId = this.dataset.tmdbId;
                    if (tmdbId && tmdbId !== 'null') {
                        self.handleCardClick(parseInt(tmdbId, 10));
                    } else {
                        self.showToast('No TMDB ID available for this movie');
                    }
                });
            });
        },

        loadPoster: function(element, tmdbId) {
            window.TMDBClient._request('/movie/' + tmdbId)
                .then(function(data) {
                    if (data && data.poster_path) {
                        var url = window.TMDBClient.getPosterUrl(data.poster_path, 'w342');
                        element.style.backgroundImage = 'url(' + url + ')';
                    }
                })
                .catch(function() {});
        },

        bindLoadMoreButton: function() {
            var self = this;
            var loadMoreBtn = document.getElementById('movies-load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', function() {
                    self.loadMore();
                });
            }
        },

        handleCardClick: function(tmdbId) {
            var self = this;

            window.TMDBClient._request('/movie/' + tmdbId)
                .then(function(tmdbItem) {
                    var title = tmdbItem.title;

                    return window.JellyfinClient.search(title)
                        .then(function(results) {
                            var match = null;
                            if (results.Items && results.Items.length > 0) {
                                match = results.Items.find(function(jfItem) {
                                    if (jfItem.ProviderIds && jfItem.ProviderIds.Tmdb) {
                                        return String(jfItem.ProviderIds.Tmdb) === String(tmdbId);
                                    }
                                    return false;
                                });

                                if (!match) {
                                    var searchName = (title || '').toLowerCase().trim();
                                    match = results.Items.find(function(jfItem) {
                                        var jfName = (jfItem.Name || '').toLowerCase().trim();
                                        return jfName === searchName && jfItem.Type === 'Movie';
                                    });
                                }
                            }

                            if (match) {
                                return window.JellyfinClient.getItem(match.Id)
                                    .then(function(fullItem) {
                                        if (window.ModalManager) {
                                            window.ModalManager.showDetails(fullItem, 'jellyfin');
                                        }
                                    });
                            } else {
                                self.showTmdbDetails(tmdbId);
                            }
                        })
                        .catch(function() {
                            self.showTmdbDetails(tmdbId);
                        });
                })
                .catch(function(error) {
                    console.error('MoviesScreen: Failed to load details', error);
                    self.showToast('Failed to load movie details');
                });
        },

        showTmdbDetails: function(tmdbId) {
            window.TMDBClient._request('/movie/' + tmdbId, { append_to_response: 'credits,videos' })
                .then(function(data) {
                    if (window.ModalManager) {
                        var formatted = window.TMDBClient.formatMovie(data);
                        formatted.credits = data.credits;
                        formatted.videos = data.videos;
                        window.ModalManager.showDetails(formatted, 'tmdb');
                    }
                })
                .catch(function(error) {
                    console.error('MoviesScreen: Failed to load TMDB details', error);
                });
        },

        // ==================== UI HELPERS ====================

        showLoading: function(show, isAppend) {
            this.isLoading = show;
            var loader = document.getElementById('movies-loading');
            if (loader) {
                loader.style.display = show ? 'flex' : 'none';
            }

            var grid = document.getElementById('movies-grid');
            if (grid && show && !isAppend) {
                grid.innerHTML = '';
            }

            if (isAppend && show) {
                var loadMoreBtn = document.getElementById('movies-load-more-btn');
                if (loadMoreBtn) {
                    loadMoreBtn.textContent = 'Loading...';
                    loadMoreBtn.disabled = true;
                }
            }
        },

        showError: function(message) {
            var container = document.getElementById('movies-grid');
            if (container) {
                container.innerHTML = '<p class="movies-error">' + message + '</p>';
            }
        },

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

        escapeHtml: function(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    window.MoviesScreen = MoviesScreen;

})(window, document);
