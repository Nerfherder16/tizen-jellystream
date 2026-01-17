/**
 * JellyStream - Modal Manager
 * Handles modal dialogs for media details, confirmations, etc.
 */
(function(window, document) {
    'use strict';

    var ModalManager = {
        initialized: false,
        currentModal: null,
        modalStack: [],
        previousFocus: null,
        boundEventListeners: [],  // Track event listeners for cleanup
        trailerCache: null,       // In-memory trailer cache

        // ==================== TRAILER CACHE ====================

        /**
         * Load trailer cache from localStorage
         */
        loadTrailerCache: function() {
            if (this.trailerCache) return this.trailerCache;
            try {
                var cached = localStorage.getItem('jellystream_trailer_cache');
                this.trailerCache = cached ? JSON.parse(cached) : {};
            } catch (e) {
                console.warn('ModalManager: Failed to load trailer cache', e);
                this.trailerCache = {};
            }
            return this.trailerCache;
        },

        /**
         * Save trailer cache to localStorage
         */
        saveTrailerCache: function() {
            try {
                localStorage.setItem('jellystream_trailer_cache', JSON.stringify(this.trailerCache || {}));
            } catch (e) {
                console.warn('ModalManager: Failed to save trailer cache', e);
            }
        },

        /**
         * Get cached trailer key for an item
         * @param {string} itemId - Jellyfin item ID
         */
        getCachedTrailer: function(itemId) {
            var cache = this.loadTrailerCache();
            return cache[itemId] || null;
        },

        /**
         * Cache a trailer key for an item
         * @param {string} itemId - Jellyfin item ID
         * @param {string} youtubeKey - YouTube video key
         */
        cacheTrailer: function(itemId, youtubeKey) {
            if (!itemId || !youtubeKey) return;
            var cache = this.loadTrailerCache();
            cache[itemId] = youtubeKey;
            this.trailerCache = cache;
            this.saveTrailerCache();
        },

        /**
         * Fetch trailer from Trakt for a Jellyfin item
         * @param {object} mediaData - Jellyfin item data
         * @returns {Promise<string|null>} YouTube key or null
         */
        fetchTrailerFromTrakt: function(mediaData) {
            var self = this;

            if (!window.TraktClient) {
                return Promise.resolve(null);
            }

            // Get IDs from Jellyfin ProviderIds
            var providerIds = mediaData.ProviderIds || {};
            var imdbId = providerIds.Imdb;
            var tmdbId = providerIds.Tmdb;
            var mediaType = mediaData.Type; // 'Movie' or 'Series'

            // Prefer IMDB ID, fallback to TMDB ID
            var lookupId = imdbId || (tmdbId ? 'tmdb:' + tmdbId : null);
            if (!lookupId) {
                return Promise.resolve(null);
            }

            // Fetch from Trakt based on media type
            var fetchPromise;
            if (mediaType === 'Movie') {
                fetchPromise = window.TraktClient.getMovieSummary(lookupId);
            } else {
                fetchPromise = window.TraktClient.getShowSummary(lookupId);
            }

            return fetchPromise
                .then(function(summary) {
                    if (summary && summary.trailer) {
                        var youtubeKey = window.TraktClient.extractYouTubeKey(summary.trailer);
                        if (youtubeKey) {
                            // Cache the result
                            self.cacheTrailer(mediaData.Id, youtubeKey);
                            return youtubeKey;
                        }
                    }
                    return null;
                })
                .catch(function() {
                    return null;
                });
        },

        /**
         * Get trailer key for a Jellyfin item (checks Jellyfin, cache, then Trakt)
         * @param {object} mediaData - Jellyfin item data
         * @returns {Promise<string|null>} YouTube key or null
         */
        getTrailerKey: function(mediaData) {
            var self = this;

            // 1. Check Jellyfin RemoteTrailers first
            if (mediaData.RemoteTrailers && mediaData.RemoteTrailers.length > 0) {
                var youtubeTrailer = mediaData.RemoteTrailers.find(function(t) {
                    return t.Url && t.Url.includes('youtube');
                });
                if (youtubeTrailer) {
                    var match = youtubeTrailer.Url.match(/(?:v=|\/)([\w-]{11})/);
                    if (match) {
                        return Promise.resolve(match[1]);
                    }
                }
            }

            // 2. Check localStorage cache
            var cached = this.getCachedTrailer(mediaData.Id);
            if (cached) {
                return Promise.resolve(cached);
            }

            // 3. Fetch from Trakt
            return this.fetchTrailerFromTrakt(mediaData);
        },

        /**
         * Initialize modal manager
         */
        init: function() {
            if (this.initialized) return;

            console.log('ModalManager: Initializing');

            this.createModalContainer();
            this.bindEvents();
            this.initialized = true;

            console.log('ModalManager: Initialized');
        },

        /**
         * Create modal container element
         */
        createModalContainer: function() {
            if (document.getElementById('modal-container')) return;

            var container = document.createElement('div');
            container.id = 'modal-container';
            container.className = 'modal-overlay';
            container.innerHTML = '<div class="modal-content" id="modal-content"></div>';
            document.body.appendChild(container);
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            var self = this;
            var container = document.getElementById('modal-container');

            // Close on overlay click
            container.addEventListener('click', function(e) {
                if (e.target === container) {
                    self.close();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && self.isOpen()) {
                    e.preventDefault();
                    self.close();
                }
            });
        },

        /**
         * Check if modal is open
         */
        isOpen: function() {
            var container = document.getElementById('modal-container');
            return container && container.classList.contains('active');
        },

        /**
         * Add tracked event listener (will be cleaned up on modal close)
         */
        addTrackedListener: function(element, event, handler) {
            if (!element) return;
            element.addEventListener(event, handler);
            this.boundEventListeners.push({
                element: element,
                event: event,
                handler: handler
            });
        },

        /**
         * Clean up all tracked event listeners
         */
        cleanupEventListeners: function() {
            console.log('ModalManager: Cleaning up', this.boundEventListeners.length, 'event listeners');
            this.boundEventListeners.forEach(function(listener) {
                if (listener.element) {
                    listener.element.removeEventListener(listener.event, listener.handler);
                }
            });
            this.boundEventListeners = [];
        },

        /**
         * Show media details modal
         */
        showDetails: function(mediaData, source) {
            var self = this;
            console.log('ModalManager: Showing details', mediaData, source);

            // Save current focus
            if (window.FocusManager && window.FocusManager.currentFocus) {
                this.previousFocus = window.FocusManager.currentFocus;
            }

            // Check if this is a TV series - show episode picker instead
            if (mediaData.Type === 'Series' && source === 'jellyfin') {
                this.showSeriesDetails(mediaData);
                return;
            }

            // Store current media data for Trakt actions
            this.currentMediaData = mediaData;
            this.currentMediaSource = source;

            // For Jellyfin items, fetch trailer asynchronously
            if (source === 'jellyfin') {
                // Show modal immediately with content (no trailer button yet)
                var content = this.buildDetailsContent(mediaData, source, null);
                this.show(content);
                // Note: show() calls bindActionButtons() which handles all button events

                // Update state
                if (window.StateManager) {
                    window.StateManager.ui.isModalOpen = true;
                    window.StateManager.ui.modalType = 'details';
                }

                // Focus first button
                setTimeout(function() {
                    var firstBtn = document.querySelector('#modal-content .btn');
                    if (firstBtn && window.FocusManager) {
                        window.FocusManager.setFocus(firstBtn);
                    }
                }, 100);

                // Fetch trailer in background and add button when ready
                this.getTrailerKey(mediaData).then(function(trailerKey) {
                    if (trailerKey && self.isOpen()) {
                        self.injectTrailerButton(trailerKey);
                    }
                }).catch(function() {
                    // Trailer fetch failed silently - not critical
                });
            } else {
                // Non-Jellyfin source - use existing flow
                var content = this.buildDetailsContent(mediaData, source, null);
                this.show(content);

                if (window.StateManager) {
                    window.StateManager.ui.isModalOpen = true;
                    window.StateManager.ui.modalType = 'details';
                }

                setTimeout(function() {
                    var firstBtn = document.querySelector('#modal-content .btn');
                    if (firstBtn && window.FocusManager) {
                        window.FocusManager.setFocus(firstBtn);
                    }
                }, 100);
            }
        },

        /**
         * Inject trailer button into open modal
         */
        injectTrailerButton: function(trailerKey) {
            var self = this;

            // Find the actions container
            var actionsContainer = document.querySelector('.details-actions');
            if (!actionsContainer) {
                return;
            }

            // Check if trailer button already exists
            if (actionsContainer.querySelector('[data-action="trailer"]')) {
                return;
            }

            // Create trailer button
            var trailerBtn = document.createElement('button');
            trailerBtn.className = 'btn btn-trailer focusable';
            trailerBtn.setAttribute('data-action', 'trailer');
            trailerBtn.setAttribute('data-trailer-key', trailerKey);
            trailerBtn.textContent = 'Trailer';

            // Insert after play button or at beginning
            var playBtn = actionsContainer.querySelector('[data-action="play"]');
            if (playBtn && playBtn.nextSibling) {
                actionsContainer.insertBefore(trailerBtn, playBtn.nextSibling);
            } else {
                actionsContainer.appendChild(trailerBtn);
            }

            // Bind click event
            trailerBtn.addEventListener('click', function() {
                self.playTrailer(trailerKey);
            });

            // Also add trailer overlay on poster
            var posterContainer = document.querySelector('.details-poster');
            if (posterContainer && !posterContainer.querySelector('.trailer-play-btn')) {
                var overlayBtn = document.createElement('button');
                overlayBtn.className = 'trailer-play-btn focusable';
                overlayBtn.setAttribute('data-trailer-key', trailerKey);
                overlayBtn.setAttribute('tabindex', '0');
                overlayBtn.setAttribute('title', 'Watch Trailer');
                posterContainer.appendChild(overlayBtn);

                overlayBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.playTrailer(trailerKey);
                });
            }
        },

        /**
         * Inject trailer button into series modal
         */
        injectSeriesTrailerButton: function(trailerKey) {
            var self = this;

            // Find the series actions container
            var actionsContainer = document.querySelector('.series-actions');
            if (!actionsContainer) {
                return;
            }

            // Check if trailer button already exists
            if (actionsContainer.querySelector('[data-action="trailer"]')) {
                return;
            }

            // Create trailer button
            var trailerBtn = document.createElement('button');
            trailerBtn.className = 'btn btn-trailer focusable';
            trailerBtn.setAttribute('data-action', 'trailer');
            trailerBtn.setAttribute('data-trailer-key', trailerKey);
            trailerBtn.textContent = 'Trailer';

            // Insert at beginning of actions
            actionsContainer.insertBefore(trailerBtn, actionsContainer.firstChild);

            // Bind click event
            trailerBtn.addEventListener('click', function() {
                self.playTrailer(trailerKey);
            });

            // Also add trailer overlay on poster
            var posterContainer = document.querySelector('.series-poster');
            if (posterContainer && !posterContainer.querySelector('.trailer-play-btn')) {
                var overlayBtn = document.createElement('button');
                overlayBtn.className = 'trailer-play-btn focusable';
                overlayBtn.setAttribute('data-trailer-key', trailerKey);
                overlayBtn.setAttribute('tabindex', '0');
                overlayBtn.setAttribute('title', 'Watch Trailer');
                posterContainer.appendChild(overlayBtn);

                overlayBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.playTrailer(trailerKey);
                });
            }
        },

        /**
         * Show series details with episode picker
         */
        showSeriesDetails: function(series) {
            var self = this;
            console.log('ModalManager: Showing series details', series.Name);

            // Build initial content with loading state
            var content = this.buildSeriesContent(series, [], null, true);
            this.show(content);

            // Bind series-specific events (close button, etc.)
            this.bindSeriesEvents();

            // Update state
            if (window.StateManager) {
                window.StateManager.ui.isModalOpen = true;
                window.StateManager.ui.modalType = 'series';
            }

            // Store series data
            this.currentSeries = series;
            this.currentSeasons = [];
            this.currentSeason = null;
            this.currentEpisodes = [];
            this.traktProgress = null;
            this.traktShowIds = null;
            this.traktShowTitle = null;
            this.userToggledEpisode = false;  // Flag to prevent rebuild overwriting user changes

            // Try to load Trakt progress for the show
            this.loadTraktProgress(series);

            // Fetch trailer in background and add button when ready
            this.getTrailerKey(series).then(function(trailerKey) {
                if (trailerKey && self.isOpen()) {
                    self.injectSeriesTrailerButton(trailerKey);
                }
            }).catch(function() {
                // Trailer fetch failed silently - not critical
            });

            // Load seasons
            window.JellyfinClient.getSeasons(series.Id)
                .then(function(response) {
                    console.log('ModalManager: Seasons loaded', response);
                    self.currentSeasons = response.Items || [];

                    if (self.currentSeasons.length > 0) {
                        // Select first season by default
                        self.selectSeason(self.currentSeasons[0]);
                    } else {
                        // No seasons - update UI
                        var content = self.buildSeriesContent(series, [], null, false);
                        self.updateModalContent(content);
                    }
                })
                .catch(function(error) {
                    console.error('ModalManager: Failed to load seasons', error);
                    var content = self.buildSeriesContent(series, [], null, false);
                    self.updateModalContent(content);
                });
        },

        /**
         * Load Trakt watched progress for a series
         */
        loadTraktProgress: function(series) {
            var self = this;

            // Check if Trakt is connected
            if (!window.TraktClient || !window.TraktClient.isAuthenticated()) {
                console.log('ModalManager: Trakt not connected, skipping progress load');
                return;
            }

            // Get IMDB ID or TMDB ID from series ProviderIds
            var traktId = null;
            var showIds = {};  // Store IDs for later use in toggle

            if (series.ProviderIds) {
                if (series.ProviderIds.Imdb) {
                    traktId = series.ProviderIds.Imdb;
                    showIds.imdb = series.ProviderIds.Imdb;
                }
                if (series.ProviderIds.Tmdb) {
                    if (!traktId) traktId = 'tmdb:' + series.ProviderIds.Tmdb;
                    showIds.tmdb = parseInt(series.ProviderIds.Tmdb, 10);
                }
                if (series.ProviderIds.Tvdb) {
                    showIds.tvdb = parseInt(series.ProviderIds.Tvdb, 10);
                }
            }

            if (!traktId) {
                console.log('ModalManager: No IMDB/TMDB ID for Trakt lookup');
                return;
            }

            console.log('========================================');
            console.log('TRAKT PROGRESS LOAD - SERIES MODAL OPENED');
            console.log('Jellyfin Series Name:', series.Name);
            console.log('Jellyfin Series ID:', series.Id);
            console.log('Jellyfin ProviderIds:', JSON.stringify(series.ProviderIds));
            console.log('Built showIds for Trakt:', JSON.stringify(showIds));
            console.log('Using traktId for lookup:', traktId);
            console.log('========================================');

            // Store show IDs for later use in toggle operations
            this.traktShowIds = showIds;
            this.traktShowTitle = series.Name;

            window.TraktClient.getShowWatchedProgress(traktId)
                .then(function(progress) {
                    self.traktProgress = progress;
                    console.log('ModalManager: Trakt progress loaded', progress);

                    // If progress includes show object with IDs, update our stored IDs
                    if (progress && progress.show && progress.show.ids) {
                        console.log('========================================');
                        console.log('TRAKT PROGRESS RESPONSE - OVERRIDING IDS');
                        console.log('Previous traktShowIds:', JSON.stringify(self.traktShowIds));
                        console.log('Trakt returned show:', progress.show.title);
                        console.log('Trakt returned IDs:', JSON.stringify(progress.show.ids));
                        console.log('========================================');
                        self.traktShowIds = progress.show.ids;
                    }

                    // Refresh episode display if we already have episodes loaded
                    // BUT don't rebuild if user has already toggled an episode (would overwrite their change)
                    if (self.currentEpisodes && self.currentEpisodes.length > 0 && self.currentSeason && !self.userToggledEpisode) {
                        var content = self.buildSeriesContent(self.currentSeries, self.currentSeasons, self.currentSeason, false);
                        self.updateModalContent(content);
                    } else if (self.userToggledEpisode) {
                        console.log('ModalManager: Skipping rebuild - user has toggled episode');
                    }
                })
                .catch(function(error) {
                    console.error('ModalManager: Failed to load Trakt progress', error);
                    self.traktProgress = null;
                });
        },

        /**
         * Get Trakt watched status for an episode
         */
        getTraktEpisodeStatus: function(seasonNumber, episodeNumber) {
            if (!this.traktProgress || !this.traktProgress.seasons) {
                return { watched: false, plays: 0 };
            }

            var season = this.traktProgress.seasons.find(function(s) {
                return s.number === seasonNumber;
            });

            if (!season || !season.episodes) {
                return { watched: false, plays: 0 };
            }

            var episode = season.episodes.find(function(e) {
                return e.number === episodeNumber;
            });

            if (!episode) {
                return { watched: false, plays: 0 };
            }

            return {
                watched: episode.completed || false,
                plays: episode.plays || 0
            };
        },

        /**
         * Select a season and load its episodes
         */
        selectSeason: function(season) {
            var self = this;
            console.log('ModalManager: Selecting season', season.Name);

            this.currentSeason = season;

            // Update UI to show loading
            var content = this.buildSeriesContent(this.currentSeries, this.currentSeasons, season, true);
            this.updateModalContent(content);

            // Load episodes for this season
            window.JellyfinClient.getEpisodes(this.currentSeries.Id, season.Id)
                .then(function(response) {
                    console.log('ModalManager: Episodes loaded', response);
                    self.currentEpisodes = response.Items || [];

                    // Update UI with episodes
                    var content = self.buildSeriesContent(self.currentSeries, self.currentSeasons, season, false);
                    self.updateModalContent(content);

                    // Focus first episode
                    setTimeout(function() {
                        var firstEp = document.querySelector('.episode-item.focusable');
                        if (firstEp && window.FocusManager) {
                            window.FocusManager.setFocus(firstEp);
                        }
                    }, 100);
                })
                .catch(function(error) {
                    console.error('ModalManager: Failed to load episodes', error);
                    self.currentEpisodes = [];
                    var content = self.buildSeriesContent(self.currentSeries, self.currentSeasons, season, false);
                    self.updateModalContent(content);
                });
        },

        /**
         * Build series modal content
         */
        buildSeriesContent: function(series, seasons, selectedSeason, isLoading) {
            var serverUrl = window.StateManager.jellyfin.serverUrl;
            var posterUrl = '';

            if (series.ImageTags && series.ImageTags.Primary) {
                posterUrl = serverUrl + '/Items/' + series.Id + '/Images/Primary?maxWidth=300&quality=90';
            }

            // Extract trailer key from RemoteTrailers
            var trailerKey = null;
            if (series.RemoteTrailers && series.RemoteTrailers.length > 0) {
                var youtubeTrailer = series.RemoteTrailers.find(function(t) {
                    return t.Url && t.Url.includes('youtube');
                });
                if (youtubeTrailer) {
                    var match = youtubeTrailer.Url.match(/(?:v=|\/)([\w-]{11})/);
                    if (match) trailerKey = match[1];
                }
            }

            // Extract cast
            var cast = [];
            if (series.People && series.People.length > 0) {
                cast = series.People.filter(function(p) { return p.Type === 'Actor'; }).slice(0, 6);
            }

            var html = '<div class="series-modal">';

            // Left side - poster and info
            html += '<div class="series-sidebar">';
            html += '<div class="series-poster" style="background-image: url(\'' + posterUrl + '\')">';
            if (trailerKey) {
                html += '<button class="trailer-play-btn focusable" data-trailer-key="' + trailerKey + '" tabindex="0" title="Watch Trailer"></button>';
            }
            html += '</div>';
            html += '<div class="series-info">';
            html += '<h2 class="series-title">' + this.escapeHtml(series.Name) + '</h2>';

            var meta = [];
            if (series.ProductionYear) meta.push(series.ProductionYear);
            if (series.Status) meta.push(series.Status);
            if (series.OfficialRating) meta.push(series.OfficialRating);
            html += '<p class="series-meta">' + meta.join(' • ') + '</p>';

            if (series.CommunityRating) {
                html += '<p class="series-rating">★ ' + series.CommunityRating.toFixed(1) + '</p>';
            }

            // Genres
            if (series.Genres && series.Genres.length > 0) {
                html += '<div class="series-genres">';
                series.Genres.slice(0, 3).forEach(function(genre) {
                    html += '<span class="genre-tag">' + this.escapeHtml(genre) + '</span>';
                }.bind(this));
                html += '</div>';
            }

            // Overview
            if (series.Overview) {
                html += '<p class="series-overview">' + this.escapeHtml(series.Overview).substring(0, 200);
                if (series.Overview.length > 200) html += '...';
                html += '</p>';
            }

            // Action buttons
            html += '<div class="series-actions">';
            if (trailerKey) {
                html += '<button class="btn btn-trailer focusable" data-action="trailer" data-trailer-key="' + trailerKey + '">Trailer</button>';
            }
            html += '</div>';

            // Cast section
            if (cast.length > 0) {
                html += '<div class="series-cast">';
                html += '<h4 class="cast-heading">Cast</h4>';
                html += '<div class="cast-list-compact">';
                cast.forEach(function(person) {
                    var profileUrl = '';
                    if (person.PrimaryImageTag) {
                        profileUrl = serverUrl + '/Items/' + person.Id + '/Images/Primary?maxWidth=60&quality=80';
                    }
                    html += '<div class="cast-item-compact">';
                    html += '<div class="cast-photo-small" style="background-image: url(\'' + profileUrl + '\')"></div>';
                    html += '<div class="cast-info-compact">';
                    html += '<span class="cast-name-small">' + this.escapeHtml(person.Name) + '</span>';
                    if (person.Role) {
                        html += '<span class="cast-role-small">' + this.escapeHtml(person.Role) + '</span>';
                    }
                    html += '</div>';
                    html += '</div>';
                }.bind(this));
                html += '</div>';
                html += '</div>';
            }

            html += '</div>'; // series-info
            html += '</div>'; // series-sidebar

            // Right side - seasons and episodes
            html += '<div class="series-content">';
            html += '<div class="modal-header-buttons">';
            // Trakt menu button (only if Trakt is connected)
            if (window.TraktClient && window.TraktClient.isAuthenticated()) {
                html += '<button class="btn-menu focusable" id="series-trakt-menu-btn" title="Trakt Actions">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>';
                html += '</button>';
            }
            html += '<button class="btn-close focusable" id="modal-close-btn">&times;</button>';
            html += '</div>';

            // Season tabs
            if (seasons.length > 0) {
                html += '<div class="season-tabs">';
                seasons.forEach(function(season) {
                    var isActive = selectedSeason && season.Id === selectedSeason.Id;
                    html += '<button class="season-tab focusable' + (isActive ? ' active' : '') + '" data-season-id="' + season.Id + '">';
                    html += this.escapeHtml(season.Name);
                    html += '</button>';
                }.bind(this));
                html += '</div>';
            }

            // Episodes list
            html += '<div class="episodes-container">';

            if (isLoading) {
                html += '<div class="episodes-loading"><div class="spinner"></div><p>Loading episodes...</p></div>';
            } else if (this.currentEpisodes && this.currentEpisodes.length > 0) {
                html += '<div class="episodes-list">';
                this.currentEpisodes.forEach(function(episode) {
                    html += this.buildEpisodeItem(episode);
                }.bind(this));
                html += '</div>';
            } else {
                html += '<p class="episodes-empty">No episodes available</p>';
            }

            html += '</div>'; // episodes-container
            html += '</div>'; // series-content
            html += '</div>'; // series-modal

            return html;
        },

        /**
         * Build episode item HTML
         */
        buildEpisodeItem: function(episode) {
            var serverUrl = window.StateManager.jellyfin.serverUrl;
            var thumbUrl = '';

            if (episode.ImageTags && episode.ImageTags.Primary) {
                thumbUrl = serverUrl + '/Items/' + episode.Id + '/Images/Primary?maxWidth=300&quality=90';
            } else if (episode.SeriesId && episode.ParentThumbImageTag) {
                thumbUrl = serverUrl + '/Items/' + episode.SeriesId + '/Images/Thumb?maxWidth=300&quality=90';
            }

            // Get Jellyfin progress
            var progress = 0;
            if (episode.UserData && episode.UserData.PlayedPercentage) {
                progress = Math.round(episode.UserData.PlayedPercentage);
            }

            // Check Jellyfin watched status
            var jellyfinWatched = episode.UserData && episode.UserData.Played;

            // Check Trakt watched status (takes priority)
            // Use nullish coalescing logic: 0 is valid for season (specials), only default if undefined/null
            var seasonNumber = (episode.ParentIndexNumber !== undefined && episode.ParentIndexNumber !== null)
                ? episode.ParentIndexNumber : 1;
            var episodeNumber = (episode.IndexNumber !== undefined && episode.IndexNumber !== null)
                ? episode.IndexNumber : 1;
            var traktStatus = this.getTraktEpisodeStatus(seasonNumber, episodeNumber);

            // Trakt is source of truth when authenticated, otherwise use Jellyfin
            var isWatched;
            if (this.traktProgress && window.TraktClient && window.TraktClient.isAuthenticated()) {
                // Trakt is authoritative - only use Trakt status
                isWatched = traktStatus.watched;
            } else {
                // Fallback to Jellyfin when not using Trakt
                isWatched = jellyfinWatched;
            }

            // Debug: Log watch status (including raw values to catch season 0 issues)
            console.log('Episode:', episode.Name,
                'raw S' + episode.ParentIndexNumber + 'E' + episode.IndexNumber,
                '-> S' + seasonNumber + 'E' + episodeNumber,
                'Trakt:', traktStatus.watched, 'Jellyfin:', jellyfinWatched,
                'Final:', isWatched);

            // Calculate time remaining for in-progress episodes
            var remainingMinutes = 0;
            if (progress > 0 && progress < 100 && episode.RunTimeTicks) {
                var totalMinutes = Math.floor(episode.RunTimeTicks / 600000000);
                remainingMinutes = Math.ceil(totalMinutes * (100 - progress) / 100);
            }

            var html = '<div class="episode-item focusable" tabindex="0" data-episode-id="' + episode.Id + '" ' +
                'data-season="' + seasonNumber + '" data-episode="' + episodeNumber + '" data-watched="' + isWatched + '">';

            // Thumbnail
            html += '<div class="episode-thumb" style="background-image: url(\'' + thumbUrl + '\')">';

            // Trakt-styled progress bar (only if in progress and not fully watched)
            if (progress > 0 && progress < 100 && !isWatched) {
                html += '<div class="episode-progress trakt-progress"><div class="episode-progress-bar trakt-gradient" style="width: ' + progress + '%"></div></div>';
            }

            // Trakt-styled watched badge (checkmark)
            if (isWatched) {
                html += '<div class="episode-watched trakt-badge">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
                    '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' +
                    '</svg></div>';
            } else if (progress > 0 && progress < 100) {
                // Trakt-styled in-progress badge with percentage
                html += '<div class="episode-in-progress trakt-badge"><span>' + progress + '%</span></div>';
            }

            // Time remaining badge
            if (remainingMinutes > 0 && !isWatched) {
                html += '<div class="episode-time-badge">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">' +
                    '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>' +
                    '</svg>' +
                    '<span>' + remainingMinutes + 'm left</span></div>';
            }

            html += '</div>';

            // Info
            html += '<div class="episode-info">';
            html += '<h4 class="episode-title">';
            if (episode.IndexNumber) {
                html += '<span class="episode-number">E' + episode.IndexNumber + '</span> ';
            }
            html += this.escapeHtml(episode.Name);
            html += '</h4>';

            if (episode.Overview) {
                var overview = episode.Overview.length > 150 ? episode.Overview.substring(0, 150) + '...' : episode.Overview;
                html += '<p class="episode-overview">' + this.escapeHtml(overview) + '</p>';
            }

            var meta = [];
            if (episode.RunTimeTicks) {
                meta.push(this.formatRuntime(episode.RunTimeTicks));
            }
            if (meta.length > 0) {
                html += '<p class="episode-meta">' + meta.join(' • ') + '</p>';
            }

            html += '</div>'; // episode-info

            // Watch toggle button (only if Trakt is connected)
            if (window.TraktClient && window.TraktClient.isAuthenticated()) {
                var toggleIcon = isWatched
                    ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
                    : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
                html += '<button class="episode-watch-toggle focusable' + (isWatched ? ' watched' : '') + '" ' +
                    'data-season="' + seasonNumber + '" data-episode="' + episodeNumber + '" ' +
                    'title="' + (isWatched ? 'Mark as unwatched' : 'Mark as watched') + '">' +
                    toggleIcon + '</button>';
            }

            html += '</div>'; // episode-item

            return html;
        },

        /**
         * Update modal content without closing
         */
        updateModalContent: function(content) {
            var contentEl = document.getElementById('modal-content');
            if (contentEl) {
                // Clean up existing event listeners before rebinding
                this.cleanupEventListeners();
                contentEl.innerHTML = content;
                this.bindSeriesEvents();
            }
        },

        /**
         * Bind series modal events
         */
        bindSeriesEvents: function() {
            var self = this;

            // Close button
            var closeBtn = document.getElementById('modal-close-btn');
            if (closeBtn) {
                var closeHandler = function() {
                    self.close();
                };
                this.addTrackedListener(closeBtn, 'click', closeHandler);
            }

            // Trakt menu button for series
            var traktMenuBtn = document.getElementById('series-trakt-menu-btn');
            if (traktMenuBtn) {
                var traktHandler = function() {
                    self.openTraktActionsForSeries();
                };
                this.addTrackedListener(traktMenuBtn, 'click', traktHandler);
            }

            // Trailer buttons (both poster overlay and button)
            var trailerBtns = document.querySelectorAll('[data-trailer-key]');
            trailerBtns.forEach(function(btn) {
                var trailerHandler = function(e) {
                    e.stopPropagation();
                    var key = btn.dataset.trailerKey;
                    if (key) {
                        self.playTrailer(key);
                    }
                };
                self.addTrackedListener(btn, 'click', trailerHandler);
            });

            // Season tabs
            var seasonTabs = document.querySelectorAll('.season-tab');
            seasonTabs.forEach(function(tab) {
                var seasonHandler = function() {
                    var seasonId = tab.dataset.seasonId;
                    var season = self.currentSeasons.find(function(s) {
                        return s.Id === seasonId;
                    });
                    if (season) {
                        self.selectSeason(season);
                    }
                };
                self.addTrackedListener(tab, 'click', seasonHandler);
            });

            // Episode items
            var episodeItems = document.querySelectorAll('.episode-item');
            episodeItems.forEach(function(item) {
                var episodeHandler = function(e) {
                    // Don't play if clicking the watch toggle button
                    if (e.target.closest('.episode-watch-toggle')) {
                        return;
                    }
                    var episodeId = item.dataset.episodeId;
                    self.playEpisode(episodeId);
                };
                self.addTrackedListener(item, 'click', episodeHandler);
            });

            // Episode watch toggle buttons
            var watchToggles = document.querySelectorAll('.episode-watch-toggle');
            watchToggles.forEach(function(btn) {
                var watchHandler = function(e) {
                    e.stopPropagation();
                    self.toggleEpisodeWatched(btn);
                };
                self.addTrackedListener(btn, 'click', watchHandler);
            });
        },

        /**
         * Toggle episode watched status in Trakt
         */
        toggleEpisodeWatched: function(btn) {
            var self = this;

            // Prevent duplicate requests (debounce)
            if (btn._isToggling) {
                console.log('ModalManager: Toggle already in progress, ignoring');
                return;
            }
            btn._isToggling = true;

            var seasonNum = parseInt(btn.dataset.season, 10);
            var episodeNum = parseInt(btn.dataset.episode, 10);
            var isCurrentlyWatched = btn.classList.contains('watched');

            console.log('ModalManager: Toggle episode', 'S' + seasonNum + 'E' + episodeNum, 'currently watched:', isCurrentlyWatched);

            // Mark that user has interacted - prevents loadTraktProgress from overwriting changes
            this.userToggledEpisode = true;

            // Get show IDs - use traktShowIds (built during loadTraktProgress with ALL available IDs)
            var show = {};

            if (this.traktShowIds) {
                show.ids = this.traktShowIds;
                show.title = this.traktShowTitle || this.currentSeries.Name;
                console.log('ModalManager: Using stored traktShowIds:', JSON.stringify(show.ids));
            }
            // Fallback to rebuild from Jellyfin ProviderIds (use ALL IDs, not just one)
            else if (this.currentSeries && this.currentSeries.ProviderIds) {
                show.ids = {};
                if (this.currentSeries.ProviderIds.Imdb) {
                    show.ids.imdb = this.currentSeries.ProviderIds.Imdb;
                }
                if (this.currentSeries.ProviderIds.Tmdb) {
                    show.ids.tmdb = parseInt(this.currentSeries.ProviderIds.Tmdb, 10);
                }
                if (this.currentSeries.ProviderIds.Tvdb) {
                    show.ids.tvdb = parseInt(this.currentSeries.ProviderIds.Tvdb, 10);
                }
                show.title = this.currentSeries.Name;
                console.log('ModalManager: Using Jellyfin ProviderIds:', JSON.stringify(show.ids));
            }

            if (!show.ids || Object.keys(show.ids).length === 0) {
                console.error('ModalManager: No show IDs available for Trakt');
                btn._isToggling = false;
                return;
            }

            // Show loading state
            btn.classList.add('loading');
            btn.disabled = true;

            var promise;
            if (isCurrentlyWatched) {
                // Remove from history
                promise = window.TraktClient.removeEpisodeFromHistory(show, seasonNum, episodeNum);
            } else {
                // Mark as watched
                promise = window.TraktClient.markEpisodeWatched(show, seasonNum, episodeNum);
            }

            promise
                .then(function(result) {
                    console.log('ModalManager: Episode watch toggle API response', result);

                    // Validate API response - check if change was actually applied
                    var changeApplied = false;
                    var errorMsg = null;

                    if (isCurrentlyWatched) {
                        // We tried to unwatch - check deleted count
                        if (result && result.deleted && result.deleted.episodes > 0) {
                            changeApplied = true;
                            console.log('ModalManager: Trakt confirmed episode unwatched');
                        } else if (result && result.not_found &&
                                   ((result.not_found.shows && result.not_found.shows.length > 0) ||
                                    (result.not_found.episodes && result.not_found.episodes.length > 0))) {
                            errorMsg = 'Show/episode not found on Trakt';
                            console.error('ModalManager: Trakt could not find show/episode:', result.not_found);
                        } else {
                            // deleted.episodes is 0 - episode may not have been in history
                            // Still consider this "success" - it's now unwatched
                            changeApplied = true;
                            console.log('ModalManager: Episode was not in Trakt history (already unwatched)');
                        }
                    } else {
                        // We tried to mark as watched - check added count
                        if (result && result.added && result.added.episodes > 0) {
                            changeApplied = true;
                            console.log('ModalManager: Trakt confirmed episode watched');
                        } else if (result && result.not_found &&
                                   ((result.not_found.shows && result.not_found.shows.length > 0) ||
                                    (result.not_found.episodes && result.not_found.episodes.length > 0))) {
                            errorMsg = 'Show/episode not found on Trakt';
                            console.error('ModalManager: Trakt could not find show/episode:', result.not_found);
                        } else {
                            // added.episodes is 0 - episode was already in history
                            // Still consider this "success" - it's now watched
                            changeApplied = true;
                            console.log('ModalManager: Episode was already in Trakt history (already watched)');
                        }
                    }

                    // Update UI state
                    btn.classList.remove('loading');
                    btn.disabled = false;
                    btn._isToggling = false;  // Clear debounce flag

                    if (errorMsg) {
                        // Show error - don't update UI
                        console.error('ModalManager: Toggle failed -', errorMsg);
                        // Could add visual feedback here (e.g., flash red)
                        return;
                    }

                    // Update UI only if change was applied
                    if (isCurrentlyWatched) {
                        btn.classList.remove('watched');
                        btn.title = 'Mark as watched';
                        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
                    } else {
                        btn.classList.add('watched');
                        btn.title = 'Mark as unwatched';
                        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
                    }

                    // Update episode item data attribute
                    var episodeItem = btn.closest('.episode-item');
                    if (episodeItem) {
                        episodeItem.dataset.watched = (!isCurrentlyWatched).toString();

                        // Update watched badge on thumbnail
                        var thumb = episodeItem.querySelector('.episode-thumb');
                        if (thumb) {
                            var watchedBadge = thumb.querySelector('.episode-watched');
                            if (!isCurrentlyWatched) {
                                // Add watched badge
                                if (!watchedBadge) {
                                    thumb.insertAdjacentHTML('beforeend', '<div class="episode-watched trakt-badge">' +
                                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
                                        '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' +
                                        '</svg></div>');
                                }
                            } else {
                                // Remove watched badge
                                if (watchedBadge) {
                                    watchedBadge.remove();
                                }
                            }
                        }
                    }

                    // Update local Trakt progress cache (create entries if needed)
                    if (!self.traktProgress) {
                        self.traktProgress = { seasons: [] };
                    }
                    if (!self.traktProgress.seasons) {
                        self.traktProgress.seasons = [];
                    }

                    var season = self.traktProgress.seasons.find(function(s) {
                        return s.number === seasonNum;
                    });

                    if (!season) {
                        // Create season entry
                        season = { number: seasonNum, episodes: [] };
                        self.traktProgress.seasons.push(season);
                    }

                    if (!season.episodes) {
                        season.episodes = [];
                    }

                    var episode = season.episodes.find(function(e) {
                        return e.number === episodeNum;
                    });

                    if (!episode) {
                        // Create episode entry
                        episode = { number: episodeNum, completed: false };
                        season.episodes.push(episode);
                    }

                    // Update watched status
                    episode.completed = !isCurrentlyWatched;
                    console.log('ModalManager: Updated traktProgress cache for S' + seasonNum + 'E' + episodeNum + ' = ' + episode.completed);

                    // Also update currentEpisodes cache (Jellyfin data)
                    if (self.currentEpisodes && self.currentEpisodes.length > 0) {
                        var jfEpisode = self.currentEpisodes.find(function(ep) {
                            return ep.ParentIndexNumber === seasonNum && ep.IndexNumber === episodeNum;
                        });
                        if (jfEpisode && jfEpisode.UserData) {
                            jfEpisode.UserData.Played = !isCurrentlyWatched;
                            console.log('ModalManager: Updated currentEpisodes cache for S' + seasonNum + 'E' + episodeNum);
                        }
                    }
                })
                .catch(function(error) {
                    console.error('ModalManager: Episode watch toggle failed', error);
                    btn.classList.remove('loading');
                    btn.disabled = false;
                    btn._isToggling = false;  // Clear debounce flag
                    // Could show error toast here
                });
        },

        /**
         * Play an episode
         */
        playEpisode: function(episodeId) {
            console.log('ModalManager: Playing episode', episodeId);
            this.close();

            if (window.Router) {
                window.Router.playMedia(episodeId, 'episode', 'jellyfin');
            }
        },

        /**
         * Build details modal content
         */
        buildDetailsContent: function(mediaData, source) {
            var isJellyfin = source === 'jellyfin';
            var posterUrl = '';
            var title = '';
            var year = '';
            var overview = '';
            var rating = '';
            var runtime = '';
            var genres = [];
            var status = null;
            var mediaId = '';
            var mediaType = '';
            var trailerKey = null;

            if (isJellyfin) {
                // Jellyfin item
                title = mediaData.Name || 'Unknown';
                year = mediaData.ProductionYear || '';
                overview = mediaData.Overview || 'No description available.';
                rating = mediaData.CommunityRating ? mediaData.CommunityRating.toFixed(1) : '';
                runtime = mediaData.RunTimeTicks ? this.formatRuntime(mediaData.RunTimeTicks) : '';
                genres = mediaData.Genres || [];
                mediaId = mediaData.Id;
                mediaType = mediaData.Type === 'Movie' ? 'movie' : 'tv';
                status = 'available';

                // Poster URL
                var serverUrl = window.StateManager.jellyfin.serverUrl;
                if (mediaData.ImageTags && mediaData.ImageTags.Primary) {
                    posterUrl = serverUrl + '/Items/' + mediaData.Id + '/Images/Primary?maxWidth=400&quality=90';
                }

                // Check for trailer in Jellyfin RemoteTrailers
                if (mediaData.RemoteTrailers && mediaData.RemoteTrailers.length > 0) {
                    var youtubeTrailer = mediaData.RemoteTrailers.find(function(t) {
                        return t.Url && t.Url.includes('youtube');
                    });
                    if (youtubeTrailer) {
                        var match = youtubeTrailer.Url.match(/(?:v=|\/)([\w-]{11})/);
                        if (match) trailerKey = match[1];
                    }
                }
            } else {
                // Fallback - should not happen since we only use Jellyfin
                console.warn('ModalManager: Non-Jellyfin item received, using fallback');
                title = mediaData.title || mediaData.name || mediaData.Name || 'Unknown';
                year = mediaData.ProductionYear || (mediaData.releaseDate || '').substring(0, 4) || '';
                overview = mediaData.overview || mediaData.Overview || 'No description available.';
                mediaId = mediaData.id || mediaData.Id;
                mediaType = mediaData.Type === 'Movie' ? 'movie' : 'tv';
                status = 'available';
            }

            // Extract cast & crew (Jellyfin only)
            var cast = [];
            var director = null;
            if (mediaData.People && mediaData.People.length > 0) {
                cast = mediaData.People.filter(function(p) { return p.Type === 'Actor'; }).slice(0, 8);
                var directorPerson = mediaData.People.find(function(p) { return p.Type === 'Director'; });
                if (directorPerson) director = directorPerson.Name;
            }

            // Recommendations (Jellyfin doesn't provide these in the detail endpoint)
            var recommendations = [];

            // Build HTML
            var html = '<div class="details-modal details-modal-expanded">';

            // Left column - Poster
            html += '<div class="details-left">';
            html += '<div class="details-poster" style="background-image: url(\'' + posterUrl + '\')">';
            if (trailerKey) {
                html += '<button class="trailer-play-btn focusable" data-trailer-key="' + trailerKey + '" tabindex="0" title="Watch Trailer"></button>';
            }
            html += '</div>';
            html += '</div>';

            // Right column - Info
            html += '<div class="details-right">';
            html += '<div class="modal-header-buttons">';
            // Trakt menu button (only if Trakt is connected)
            if (window.TraktClient && window.TraktClient.isAuthenticated()) {
                html += '<button class="btn-menu focusable" id="modal-trakt-menu-btn" title="Trakt Actions">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>';
                html += '</button>';
            }
            html += '<button class="btn-close focusable" id="modal-close-btn">&times;</button>';
            html += '</div>';
            html += '<h2 class="details-title">' + this.escapeHtml(title) + '</h2>';

            // Meta row
            html += '<div class="details-meta">';
            if (year) html += '<span class="details-meta-item">' + year + '</span>';
            if (rating) html += '<span class="details-rating">' + rating + '</span>';
            if (runtime) html += '<span class="details-meta-item">' + runtime + '</span>';
            html += '</div>';

            // Genres
            if (genres.length > 0) {
                html += '<div class="details-genres">';
                genres.slice(0, 5).forEach(function(genre) {
                    html += '<span class="genre-tag">' + this.escapeHtml(genre) + '</span>';
                }.bind(this));
                html += '</div>';
            }

            // Director
            if (director) {
                html += '<p class="details-director"><span class="label">Director:</span> ' + this.escapeHtml(director) + '</p>';
            }

            // Overview
            html += '<p class="details-overview">' + this.escapeHtml(overview) + '</p>';

            // Action buttons
            html += '<div class="details-actions">';

            // Play button (always available for Jellyfin items)
            html += '<button class="btn btn-play focusable" data-action="play" data-media-id="' + mediaId + '" data-media-type="' + mediaType + '" data-source="' + source + '">Play</button>';

            if (trailerKey) {
                html += '<button class="btn btn-trailer focusable" data-action="trailer" data-trailer-key="' + trailerKey + '">Trailer</button>';
            }

            html += '</div>'; // details-actions

            // Cast & Crew section (Jellyfin only)
            if (cast.length > 0) {
                html += '<div class="details-cast">';
                html += '<h3 class="details-section-title">Cast</h3>';
                html += '<div class="cast-list">';
                cast.forEach(function(person) {
                    var name = person.Name || person.name;
                    var character = person.Role || person.character || '';
                    var profileUrl = '';
                    if (person.PrimaryImageTag) {
                        profileUrl = window.StateManager.jellyfin.serverUrl + '/Items/' + person.Id + '/Images/Primary?maxWidth=80&quality=80';
                    }
                    html += '<div class="cast-item">';
                    html += '<div class="cast-photo" style="background-image: url(\'' + profileUrl + '\')"></div>';
                    html += '<div class="cast-info">';
                    html += '<span class="cast-name">' + this.escapeHtml(name) + '</span>';
                    if (character) {
                        html += '<span class="cast-character">' + this.escapeHtml(character) + '</span>';
                    }
                    html += '</div>';
                    html += '</div>';
                }.bind(this));
                html += '</div>';
                html += '</div>';
            }

            html += '</div>'; // details-right
            html += '</div>'; // details-modal

            return html;
        },

        /**
         * Show modal with content
         */
        show: function(content) {
            var container = document.getElementById('modal-container');
            var contentEl = document.getElementById('modal-content');

            if (!container || !contentEl) {
                this.createModalContainer();
                container = document.getElementById('modal-container');
                contentEl = document.getElementById('modal-content');
            }

            contentEl.innerHTML = content;
            container.classList.add('active');

            // Bind action buttons
            this.bindActionButtons();
        },

        /**
         * Bind action button events
         */
        bindActionButtons: function() {
            var self = this;

            // Close button
            var closeBtn = document.getElementById('modal-close-btn');
            if (closeBtn) {
                var closeHandler = function() {
                    self.close();
                };
                this.addTrackedListener(closeBtn, 'click', closeHandler);
            }

            // Trakt menu button
            var traktMenuBtn = document.getElementById('modal-trakt-menu-btn');
            if (traktMenuBtn) {
                var traktHandler = function() {
                    self.openTraktActionsFromModal();
                };
                this.addTrackedListener(traktMenuBtn, 'click', traktHandler);
            }

            // Play button
            var playBtn = document.querySelector('[data-action="play"]');
            if (playBtn) {
                var playHandler = function() {
                    var mediaId = playBtn.dataset.mediaId;
                    var mediaType = playBtn.dataset.mediaType;
                    var source = playBtn.dataset.source;
                    self.handlePlay(mediaId, mediaType, source);
                };
                this.addTrackedListener(playBtn, 'click', playHandler);
            }

            // Trailer buttons (both poster overlay and action button)
            var trailerBtns = document.querySelectorAll('[data-action="trailer"], .trailer-play-btn');
            trailerBtns.forEach(function(btn) {
                var trailerHandler = function() {
                    var trailerKey = btn.dataset.trailerKey;
                    self.playTrailer(trailerKey);
                };
                self.addTrackedListener(btn, 'click', trailerHandler);
            });

        },

        /**
         * Play a YouTube trailer
         */
        playTrailer: function(videoKey) {
            console.log('ModalManager: Playing trailer', videoKey);

            if (!videoKey) return;

            // Create trailer overlay with embedded YouTube player
            var trailerHtml = '<div class="trailer-overlay" id="trailer-overlay">';
            trailerHtml += '<button class="btn-close trailer-close focusable" id="trailer-close-btn">&times;</button>';
            trailerHtml += '<div class="trailer-player-container">';
            trailerHtml += '<iframe id="trailer-iframe" class="trailer-iframe" ';
            trailerHtml += 'src="https://www.youtube.com/embed/' + videoKey + '?autoplay=1&rel=0&modestbranding=1&playsinline=1" ';
            trailerHtml += 'frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
            trailerHtml += '</div>';
            trailerHtml += '</div>';

            // Add to modal content
            var contentEl = document.getElementById('modal-content');
            if (contentEl) {
                contentEl.insertAdjacentHTML('beforeend', trailerHtml);
            }

            // Create cleanup function
            var escHandler;
            var cleanupTrailer = function() {
                var overlay = document.getElementById('trailer-overlay');
                if (overlay) {
                    overlay.remove();
                }
                // Always remove listener to prevent memory leak
                if (escHandler) {
                    document.removeEventListener('keydown', escHandler);
                }
            };

            // Close on Escape
            escHandler = function(e) {
                if (e.key === 'Escape') {
                    cleanupTrailer();
                }
            };
            document.addEventListener('keydown', escHandler);

            // Bind close button
            var closeBtn = document.getElementById('trailer-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', cleanupTrailer);

                // Focus close button
                if (window.FocusManager) {
                    window.FocusManager.setFocus(closeBtn);
                }
            }
        },

        /**
         * Handle play action
         */
        handlePlay: function(mediaId, mediaType, source) {
            console.log('ModalManager: Play', mediaId, mediaType, source);
            this.close();

            // Navigate to player
            if (window.Router) {
                window.Router.playMedia(mediaId, mediaType, source);
            }
        },

        /**
         * Close modal
         */
        close: function() {
            // Clean up all tracked event listeners to prevent memory leaks
            this.cleanupEventListeners();

            var container = document.getElementById('modal-container');
            if (container) {
                container.classList.remove('active');
            }

            // Clear modal content to release DOM references
            var contentEl = document.getElementById('modal-content');
            if (contentEl) {
                contentEl.innerHTML = '';
            }

            // Update state
            if (window.StateManager) {
                window.StateManager.ui.isModalOpen = false;
                window.StateManager.ui.modalType = null;
            }

            // Restore previous focus
            if (this.previousFocus && window.FocusManager) {
                setTimeout(function() {
                    window.FocusManager.setFocus(this.previousFocus);
                    this.previousFocus = null;
                }.bind(this), 100);
            }

            // Clear all modal-specific state
            this.currentModal = null;
            this.currentSeries = null;
            this.currentSeasons = null;
            this.currentSeason = null;
            this.currentEpisodes = null;
            this.traktProgress = null;
            this.traktShowIds = null;
            this.traktShowTitle = null;
            this.userToggledEpisode = false;
            this.currentMediaData = null;
            this.currentMediaSource = null;
            this.traktActionItem = null;
            this.traktActionType = null;
            this.traktActionParentShow = null;
            this.traktActionPlaybackId = null;
        },

        /**
         * Format runtime from ticks to readable string
         */
        formatRuntime: function(ticks) {
            var minutes = Math.floor(ticks / 600000000);
            var hours = Math.floor(minutes / 60);
            var mins = minutes % 60;

            if (hours > 0) {
                return hours + 'h ' + mins + 'm';
            }
            return mins + ' min';
        },

        // ==================== TRAKT ACTION MODAL ====================

        /**
         * Open Trakt actions for the current series modal
         */
        openTraktActionsForSeries: function() {
            var series = this.currentSeries;

            if (!series) {
                console.log('ModalManager: No current series for Trakt actions');
                return;
            }

            console.log('ModalManager: Opening Trakt actions for series', series);

            // Build Trakt-compatible item from Jellyfin series
            var item = {
                title: series.Name,
                year: series.ProductionYear,
                ids: {}
            };

            if (series.ProviderIds) {
                if (series.ProviderIds.Imdb) {
                    item.ids.imdb = series.ProviderIds.Imdb;
                }
                if (series.ProviderIds.Tmdb) {
                    item.ids.tmdb = parseInt(series.ProviderIds.Tmdb);
                }
                if (series.ProviderIds.Tvdb) {
                    item.ids.tvdb = parseInt(series.ProviderIds.Tvdb);
                }
            }

            // Show the Trakt action modal
            this.showTraktActions(item, 'show', null, null);
        },

        /**
         * Open Trakt actions from the current details modal
         */
        openTraktActionsFromModal: function() {
            var mediaData = this.currentMediaData;
            var source = this.currentMediaSource;

            if (!mediaData) {
                console.log('ModalManager: No current media data for Trakt actions');
                return;
            }

            console.log('ModalManager: Opening Trakt actions from modal', mediaData, source);

            // Determine media type and build Trakt-compatible item
            var item, type;

            // Jellyfin item - extract IDs and format for Trakt
            var isMovie = mediaData.Type === 'Movie';
            type = isMovie ? 'movie' : 'show';

            // Build item with IDs that Trakt can use
            item = {
                title: mediaData.Name,
                year: mediaData.ProductionYear,
                ids: {}
            };

            if (mediaData.ProviderIds) {
                if (mediaData.ProviderIds.Imdb) {
                    item.ids.imdb = mediaData.ProviderIds.Imdb;
                }
                if (mediaData.ProviderIds.Tmdb) {
                    item.ids.tmdb = parseInt(mediaData.ProviderIds.Tmdb);
                }
                if (mediaData.ProviderIds.Tvdb) {
                    item.ids.tvdb = parseInt(mediaData.ProviderIds.Tvdb);
                }
            }

            // Show the Trakt action modal
            this.showTraktActions(item, type, null, null);
        },

        /**
         * Show Trakt action modal for a show/movie
         * @param {object} item - The Trakt item (show, movie, or episode)
         * @param {string} type - 'show', 'movie', or 'episode'
         * @param {object} parentShow - Parent show if type is 'episode'
         * @param {number} playbackId - Playback ID if from progress (for removing)
         */
        showTraktActions: function(item, type, parentShow, playbackId) {
            var self = this;
            console.log('ModalManager: Showing Trakt actions for', type, item);

            // Store current item for actions
            this.traktActionItem = item;
            this.traktActionType = type;
            this.traktActionParentShow = parentShow;
            this.traktActionPlaybackId = playbackId;

            // Get title for display
            var title = '';
            if (type === 'episode') {
                var showTitle = parentShow ? parentShow.title : (item.show ? item.show.title : 'Unknown');
                var epTitle = item.title || item.episode?.title || '';
                var season = item.season || item.episode?.season || 0;
                var episode = item.number || item.episode?.number || 0;
                title = showTitle + ' - S' + season + 'E' + episode;
                if (epTitle) title += ': ' + epTitle;
            } else if (type === 'movie') {
                title = item.title || (item.movie ? item.movie.title : 'Unknown');
            } else {
                title = item.title || (item.show ? item.show.title : 'Unknown');
            }

            // Create action modal HTML
            var html = '<div class="trakt-action-modal">';
            html += '<div class="trakt-action-header">';
            html += '<img src="images/trakt-logo.svg" alt="Trakt" class="trakt-action-logo">';
            html += '<h3>' + this.escapeHtml(title) + '</h3>';
            html += '</div>';
            html += '<div class="trakt-action-buttons">';

            if (type === 'episode') {
                html += '<button class="trakt-action-btn focusable" data-action="mark-watched">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
                html += '<span>Mark Episode Watched</span>';
                html += '</button>';

                html += '<button class="trakt-action-btn focusable" data-action="mark-show-watched">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>';
                html += '<span>Mark Show Watched</span>';
                html += '</button>';
            } else if (type === 'movie') {
                html += '<button class="trakt-action-btn focusable" data-action="mark-watched">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
                html += '<span>Mark as Watched</span>';
                html += '</button>';
            } else {
                // Show
                html += '<button class="trakt-action-btn focusable" data-action="mark-show-watched">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>';
                html += '<span>Mark All Watched</span>';
                html += '</button>';
            }

            html += '<button class="trakt-action-btn focusable" data-action="add-watchlist">';
            html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
            html += '<span>Add to Watchlist</span>';
            html += '</button>';

            if (playbackId) {
                html += '<button class="trakt-action-btn focusable danger" data-action="remove-progress">';
                html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
                html += '<span>Remove from Progress</span>';
                html += '</button>';
            }

            html += '<button class="trakt-action-btn focusable danger" data-action="drop">';
            html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>';
            html += '<span>Drop ' + (type === 'movie' ? 'Movie' : 'Show') + '</span>';
            html += '</button>';

            html += '<button class="trakt-action-btn focusable cancel" data-action="cancel">';
            html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
            html += '<span>Cancel</span>';
            html += '</button>';

            html += '</div>'; // trakt-action-buttons
            html += '</div>'; // trakt-action-modal

            // Show in modal
            this.show(html);
            this.bindTraktActionEvents();

            // Focus first button
            setTimeout(function() {
                var firstBtn = document.querySelector('.trakt-action-btn.focusable');
                if (firstBtn && window.FocusManager) {
                    window.FocusManager.setFocus(firstBtn);
                }
            }, 100);
        },

        /**
         * Bind Trakt action modal events
         */
        bindTraktActionEvents: function() {
            var self = this;
            var buttons = document.querySelectorAll('.trakt-action-btn');

            buttons.forEach(function(btn) {
                var actionHandler = function() {
                    var action = btn.dataset.action;
                    self.handleTraktAction(action);
                };
                self.addTrackedListener(btn, 'click', actionHandler);
            });
        },

        /**
         * Handle Trakt action button click
         */
        handleTraktAction: function(action) {
            var self = this;
            var item = this.traktActionItem;
            var type = this.traktActionType;
            var parentShow = this.traktActionParentShow;
            var playbackId = this.traktActionPlaybackId;

            console.log('ModalManager: Handling Trakt action', action, type);

            if (action === 'cancel') {
                this.close();
                return;
            }

            // Show loading state
            this.showTraktActionLoading(action);

            var promise;

            switch (action) {
                case 'mark-watched':
                    if (type === 'episode') {
                        var episode = item.episode || item;
                        var show = parentShow || item.show;
                        // Use show + season + episode number format
                        promise = window.TraktClient.markEpisodeWatched(show, episode.season, episode.number);
                    } else if (type === 'movie') {
                        var movie = item.movie || item;
                        promise = window.TraktClient.markMovieWatched(movie);
                    }
                    break;

                case 'mark-show-watched':
                    var show = parentShow || item.show || item;
                    promise = window.TraktClient.markShowWatched(show);
                    break;

                case 'add-watchlist':
                    if (type === 'movie') {
                        var movie = item.movie || item;
                        promise = window.TraktClient.addMovieToWatchlist(movie);
                    } else {
                        var show = parentShow || item.show || item;
                        promise = window.TraktClient.addShowToWatchlist(show);
                    }
                    break;

                case 'remove-progress':
                    if (playbackId) {
                        promise = window.TraktClient.removePlaybackProgress(playbackId);
                    }
                    break;

                case 'drop':
                    if (type === 'movie') {
                        var movie = item.movie || item;
                        promise = window.TraktClient.removeMovieFromHistory(movie);
                    } else {
                        var show = parentShow || item.show || item;
                        promise = window.TraktClient.removeShowFromHistory(show);
                    }
                    break;
            }

            if (promise) {
                promise
                    .then(function() {
                        self.showTraktActionSuccess(action);
                        // Refresh home screen after a delay
                        setTimeout(function() {
                            self.close();
                            if (window.HomeScreen && window.HomeScreen.load) {
                                window.HomeScreen.load();
                            }
                        }, 1500);
                    })
                    .catch(function(error) {
                        console.error('Trakt action failed:', error);
                        self.showTraktActionError(action, error);
                    });
            } else {
                this.close();
            }
        },

        /**
         * Show loading state for Trakt action
         */
        showTraktActionLoading: function(action) {
            var buttonsContainer = document.querySelector('.trakt-action-buttons');
            if (buttonsContainer) {
                buttonsContainer.innerHTML = '<div class="trakt-action-loading">' +
                    '<div class="spinner"></div>' +
                    '<p>Processing...</p>' +
                    '</div>';
            }
        },

        /**
         * Show success state for Trakt action
         */
        showTraktActionSuccess: function(action) {
            var buttonsContainer = document.querySelector('.trakt-action-buttons');
            if (buttonsContainer) {
                var message = 'Done!';
                switch (action) {
                    case 'mark-watched': message = 'Marked as watched!'; break;
                    case 'mark-show-watched': message = 'Show marked as watched!'; break;
                    case 'add-watchlist': message = 'Added to watchlist!'; break;
                    case 'remove-progress': message = 'Removed from progress!'; break;
                    case 'drop': message = 'Removed from history!'; break;
                }

                buttonsContainer.innerHTML = '<div class="trakt-action-success">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' +
                    '<p>' + message + '</p>' +
                    '</div>';
            }
        },

        /**
         * Show error state for Trakt action
         */
        showTraktActionError: function(action, error) {
            var buttonsContainer = document.querySelector('.trakt-action-buttons');
            if (buttonsContainer) {
                buttonsContainer.innerHTML = '<div class="trakt-action-error">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>' +
                    '<p>Action failed</p>' +
                    '<button class="trakt-action-btn focusable cancel" onclick="window.ModalManager.close()">Close</button>' +
                    '</div>';
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
    window.ModalManager = ModalManager;

})(window, document);
