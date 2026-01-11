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
         * Show media details modal
         */
        showDetails: function(mediaData, source) {
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

            var content = this.buildDetailsContent(mediaData, source);
            this.show(content);

            // Update state
            if (window.StateManager) {
                window.StateManager.ui.isModalOpen = true;
                window.StateManager.ui.modalType = 'details';
            }

            // Focus first button in modal
            setTimeout(function() {
                var firstBtn = document.querySelector('#modal-content .btn');
                if (firstBtn && window.FocusManager) {
                    window.FocusManager.setFocus(firstBtn);
                }
            }, 100);
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

            var html = '<div class="series-modal">';

            // Left side - poster and info
            html += '<div class="series-sidebar">';
            html += '<div class="series-poster" style="background-image: url(\'' + posterUrl + '\')"></div>';
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

            html += '</div>'; // series-info
            html += '</div>'; // series-sidebar

            // Right side - seasons and episodes
            html += '<div class="series-content">';
            html += '<button class="btn-close focusable" id="modal-close-btn">&times;</button>';

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

            var progress = 0;
            if (episode.UserData && episode.UserData.PlayedPercentage) {
                progress = Math.round(episode.UserData.PlayedPercentage);
            }

            var isWatched = episode.UserData && episode.UserData.Played;

            var html = '<div class="episode-item focusable" tabindex="0" data-episode-id="' + episode.Id + '">';

            // Thumbnail
            html += '<div class="episode-thumb" style="background-image: url(\'' + thumbUrl + '\')">';
            if (progress > 0 && progress < 100) {
                html += '<div class="episode-progress"><div class="episode-progress-bar" style="width: ' + progress + '%"></div></div>';
            }
            if (isWatched) {
                html += '<div class="episode-watched">✓</div>';
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
            html += '</div>'; // episode-item

            return html;
        },

        /**
         * Update modal content without closing
         */
        updateModalContent: function(content) {
            var contentEl = document.getElementById('modal-content');
            if (contentEl) {
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
                closeBtn.addEventListener('click', function() {
                    self.close();
                });
            }

            // Season tabs
            var seasonTabs = document.querySelectorAll('.season-tab');
            seasonTabs.forEach(function(tab) {
                tab.addEventListener('click', function() {
                    var seasonId = this.dataset.seasonId;
                    var season = self.currentSeasons.find(function(s) {
                        return s.Id === seasonId;
                    });
                    if (season) {
                        self.selectSeason(season);
                    }
                });
            });

            // Episode items
            var episodeItems = document.querySelectorAll('.episode-item');
            episodeItems.forEach(function(item) {
                item.addEventListener('click', function() {
                    var episodeId = this.dataset.episodeId;
                    self.playEpisode(episodeId);
                });
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
            } else {
                // Jellyseerr/TMDb item
                title = mediaData.title || mediaData.name || 'Unknown';
                year = (mediaData.releaseDate || mediaData.firstAirDate || '').substring(0, 4);
                overview = mediaData.overview || 'No description available.';
                rating = mediaData.voteAverage ? mediaData.voteAverage.toFixed(1) : '';
                genres = (mediaData.genres || []).map(function(g) { return g.name || g; });
                mediaId = mediaData.id;
                mediaType = mediaData.mediaType || (mediaData.title ? 'movie' : 'tv');

                // Check availability
                if (mediaData.mediaInfo) {
                    status = mediaData.mediaInfo.status === 5 ? 'available' :
                             mediaData.mediaInfo.status >= 2 ? 'pending' : 'unavailable';
                } else {
                    status = 'unavailable';
                }

                // TMDb poster
                if (mediaData.posterPath) {
                    posterUrl = 'https://image.tmdb.org/t/p/w500' + mediaData.posterPath;
                }
            }

            // Build HTML
            var html = '<div class="details-modal">';

            // Poster
            html += '<div class="details-poster" style="background-image: url(\'' + posterUrl + '\')"></div>';

            // Info section
            html += '<div class="details-info">';
            html += '<button class="btn-close focusable" id="modal-close-btn">&times;</button>';
            html += '<h2 class="details-title">' + this.escapeHtml(title) + '</h2>';

            // Meta row
            html += '<div class="details-meta">';
            if (year) html += '<span class="details-meta-item">' + year + '</span>';
            if (rating) html += '<span class="details-rating">' + rating + '</span>';
            if (runtime) html += '<span class="details-meta-item">' + runtime + '</span>';
            html += '</div>';

            // Status badge
            if (status) {
                var statusText = status === 'available' ? 'Available' :
                                 status === 'pending' ? 'Requested' : 'Not Available';
                html += '<span class="status-badge status-' + status + '">' + statusText + '</span>';
            }

            // Genres
            if (genres.length > 0) {
                html += '<div class="details-genres">';
                genres.slice(0, 5).forEach(function(genre) {
                    html += '<span class="genre-tag">' + this.escapeHtml(genre) + '</span>';
                }.bind(this));
                html += '</div>';
            }

            // Overview
            html += '<p class="details-overview">' + this.escapeHtml(overview) + '</p>';

            // Action buttons
            html += '<div class="details-actions">';

            if (status === 'available' || isJellyfin) {
                html += '<button class="btn btn-play focusable" data-action="play" data-media-id="' + mediaId + '" data-media-type="' + mediaType + '" data-source="' + source + '">Play</button>';
            }

            if (!isJellyfin && status !== 'available' && status !== 'pending') {
                html += '<button class="btn btn-request focusable" data-action="request" data-media-id="' + mediaId + '" data-media-type="' + mediaType + '">Request</button>';
            }

            html += '</div>'; // details-actions
            html += '</div>'; // details-info
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
                closeBtn.addEventListener('click', function() {
                    self.close();
                });
            }

            // Play button
            var playBtn = document.querySelector('[data-action="play"]');
            if (playBtn) {
                playBtn.addEventListener('click', function() {
                    var mediaId = this.dataset.mediaId;
                    var mediaType = this.dataset.mediaType;
                    var source = this.dataset.source;
                    self.handlePlay(mediaId, mediaType, source);
                });
            }

            // Request button
            var requestBtn = document.querySelector('[data-action="request"]');
            if (requestBtn) {
                requestBtn.addEventListener('click', function() {
                    var mediaId = this.dataset.mediaId;
                    var mediaType = this.dataset.mediaType;
                    self.handleRequest(mediaId, mediaType);
                });
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
         * Handle request action
         */
        handleRequest: function(mediaId, mediaType) {
            console.log('ModalManager: Request', mediaId, mediaType);

            var requestBtn = document.querySelector('[data-action="request"]');
            if (requestBtn) {
                requestBtn.textContent = 'Requesting...';
                requestBtn.disabled = true;
            }

            window.JellyseerrClient.requestMedia(mediaType, parseInt(mediaId))
                .then(function(result) {
                    console.log('ModalManager: Request successful', result);
                    if (requestBtn) {
                        requestBtn.textContent = 'Requested!';
                        requestBtn.classList.remove('btn-request');
                        requestBtn.classList.add('btn-secondary');
                    }

                    // Update status badge
                    var badge = document.querySelector('.status-badge');
                    if (badge) {
                        badge.textContent = 'Requested';
                        badge.className = 'status-badge status-pending';
                    }
                })
                .catch(function(error) {
                    console.error('ModalManager: Request failed', error);
                    if (requestBtn) {
                        requestBtn.textContent = 'Request Failed';
                        requestBtn.disabled = false;
                    }
                    alert('Failed to submit request: ' + error.message);
                });
        },

        /**
         * Close modal
         */
        close: function() {
            var container = document.getElementById('modal-container');
            if (container) {
                container.classList.remove('active');
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

            this.currentModal = null;
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
