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
                console.log('ModalManager: Jellyfin trailers', {
                    RemoteTrailers: mediaData.RemoteTrailers,
                    hasTrailers: !!(mediaData.RemoteTrailers && mediaData.RemoteTrailers.length > 0)
                });

                if (mediaData.RemoteTrailers && mediaData.RemoteTrailers.length > 0) {
                    var youtubeTrailer = mediaData.RemoteTrailers.find(function(t) {
                        return t.Url && t.Url.includes('youtube');
                    });
                    if (youtubeTrailer) {
                        var match = youtubeTrailer.Url.match(/(?:v=|\/)([\w-]{11})/);
                        if (match) trailerKey = match[1];
                        console.log('ModalManager: Found Jellyfin trailer', youtubeTrailer.Url, 'key:', trailerKey);
                    }
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

                // Check for trailer in relatedVideos (Jellyseerr includes TMDb videos)
                // Try multiple possible property names used by different Jellyseerr versions
                var videoResults = null;
                if (mediaData.relatedVideos && mediaData.relatedVideos.results) {
                    videoResults = mediaData.relatedVideos.results;
                } else if (mediaData.videos && mediaData.videos.results) {
                    videoResults = mediaData.videos.results;
                } else if (Array.isArray(mediaData.relatedVideos)) {
                    videoResults = mediaData.relatedVideos;
                } else if (Array.isArray(mediaData.videos)) {
                    videoResults = mediaData.videos;
                }

                console.log('ModalManager: Video data', {
                    relatedVideos: mediaData.relatedVideos,
                    videos: mediaData.videos,
                    videoResults: videoResults
                });

                if (videoResults && videoResults.length > 0) {
                    var trailer = videoResults.find(function(v) {
                        return v.type === 'Trailer' && v.site === 'YouTube';
                    });
                    // If no trailer type found, try getting any YouTube video
                    if (!trailer) {
                        trailer = videoResults.find(function(v) {
                            return v.site === 'YouTube';
                        });
                    }
                    if (trailer) {
                        trailerKey = trailer.key;
                    }
                }
            }

            // Extract cast & crew
            var cast = [];
            var director = null;
            if (isJellyfin) {
                if (mediaData.People && mediaData.People.length > 0) {
                    cast = mediaData.People.filter(function(p) { return p.Type === 'Actor'; }).slice(0, 8);
                    var directorPerson = mediaData.People.find(function(p) { return p.Type === 'Director'; });
                    if (directorPerson) director = directorPerson.Name;
                }
            } else {
                if (mediaData.credits && mediaData.credits.cast) {
                    cast = mediaData.credits.cast.slice(0, 8);
                }
                if (mediaData.credits && mediaData.credits.crew) {
                    var directorCrew = mediaData.credits.crew.find(function(c) { return c.job === 'Director'; });
                    if (directorCrew) director = directorCrew.name;
                }
            }

            // Extract recommendations
            var recommendations = [];
            if (!isJellyfin && mediaData.recommendations && mediaData.recommendations.results) {
                recommendations = mediaData.recommendations.results.slice(0, 6);
            }

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

            // Director
            if (director) {
                html += '<p class="details-director"><span class="label">Director:</span> ' + this.escapeHtml(director) + '</p>';
            }

            // Overview
            html += '<p class="details-overview">' + this.escapeHtml(overview) + '</p>';

            // Action buttons
            html += '<div class="details-actions">';

            if (status === 'available' || isJellyfin) {
                html += '<button class="btn btn-play focusable" data-action="play" data-media-id="' + mediaId + '" data-media-type="' + mediaType + '" data-source="' + source + '">Play</button>';
            }

            if (trailerKey) {
                html += '<button class="btn btn-trailer focusable" data-action="trailer" data-trailer-key="' + trailerKey + '">Trailer</button>';
            }

            if (!isJellyfin && status !== 'available' && status !== 'pending') {
                html += '<button class="btn btn-request focusable" data-action="request" data-media-id="' + mediaId + '" data-media-type="' + mediaType + '">Request</button>';
            }

            html += '</div>'; // details-actions

            // Cast & Crew section
            if (cast.length > 0) {
                html += '<div class="details-cast">';
                html += '<h3 class="details-section-title">Cast</h3>';
                html += '<div class="cast-list">';
                cast.forEach(function(person) {
                    var name = person.Name || person.name;
                    var character = person.Role || person.character || '';
                    var profileUrl = '';
                    if (isJellyfin && person.PrimaryImageTag) {
                        profileUrl = window.StateManager.jellyfin.serverUrl + '/Items/' + person.Id + '/Images/Primary?maxWidth=80&quality=80';
                    } else if (person.profilePath) {
                        profileUrl = 'https://image.tmdb.org/t/p/w92' + person.profilePath;
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

            // Recommendations section
            if (recommendations.length > 0) {
                html += '<div class="details-recommendations">';
                html += '<h3 class="details-section-title">More Like This</h3>';
                html += '<div class="recommendations-list">';
                recommendations.forEach(function(rec) {
                    var recTitle = rec.title || rec.name;
                    var recPoster = rec.posterPath ? 'https://image.tmdb.org/t/p/w154' + rec.posterPath : '';
                    var recType = rec.mediaType || (rec.title ? 'movie' : 'tv');
                    html += '<div class="recommendation-item focusable" data-rec-id="' + rec.id + '" data-rec-type="' + recType + '" tabindex="0">';
                    html += '<div class="recommendation-poster" style="background-image: url(\'' + recPoster + '\')"></div>';
                    html += '<span class="recommendation-title">' + this.escapeHtml(recTitle) + '</span>';
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

            // Trailer buttons (both poster overlay and action button)
            var trailerBtns = document.querySelectorAll('[data-action="trailer"], .trailer-play-btn');
            trailerBtns.forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var trailerKey = this.dataset.trailerKey;
                    self.playTrailer(trailerKey);
                });
            });

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

            // Bind close button
            var closeBtn = document.getElementById('trailer-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    var overlay = document.getElementById('trailer-overlay');
                    if (overlay) {
                        overlay.remove();
                    }
                });

                // Focus close button
                if (window.FocusManager) {
                    window.FocusManager.setFocus(closeBtn);
                }
            }

            // Close on Escape
            var escHandler = function(e) {
                if (e.key === 'Escape') {
                    var overlay = document.getElementById('trailer-overlay');
                    if (overlay) {
                        overlay.remove();
                        document.removeEventListener('keydown', escHandler);
                    }
                }
            };
            document.addEventListener('keydown', escHandler);
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

            // For TV shows, show season selection modal
            if (mediaType === 'tv') {
                this.showSeasonSelection(mediaId);
                return;
            }

            // For movies, request directly
            this.submitRequest(mediaId, mediaType, null);
        },

        /**
         * Show season selection modal for TV shows
         */
        showSeasonSelection: function(tmdbId) {
            var self = this;
            console.log('ModalManager: Loading seasons for TV show', tmdbId);

            // Get TV show details to get seasons
            window.JellyseerrClient.getTvShow(tmdbId)
                .then(function(tvShow) {
                    console.log('ModalManager: TV show loaded', tvShow);
                    self.renderSeasonSelectionModal(tvShow);
                })
                .catch(function(error) {
                    console.error('ModalManager: Failed to load TV show', error);
                    alert('Failed to load show details');
                });
        },

        /**
         * Render season selection modal
         */
        renderSeasonSelectionModal: function(tvShow) {
            var self = this;
            var seasons = tvShow.seasons || [];

            // Filter out season 0 (specials) unless it's the only season
            var regularSeasons = seasons.filter(function(s) { return s.seasonNumber > 0; });
            if (regularSeasons.length === 0) regularSeasons = seasons;

            var html = '<div class="season-selection-modal">';
            html += '<button class="btn-close focusable" id="season-modal-close">&times;</button>';
            html += '<h2>Request ' + this.escapeHtml(tvShow.name || tvShow.title) + '</h2>';
            html += '<p class="season-selection-hint">Select which seasons to request:</p>';

            // All Seasons option
            html += '<div class="season-options">';
            html += '<label class="season-option season-option-all focusable" tabindex="0">';
            html += '<input type="checkbox" id="select-all-seasons" value="all">';
            html += '<span class="season-option-label">Request All Seasons</span>';
            html += '</label>';

            // Individual season options
            regularSeasons.forEach(function(season) {
                var isAvailable = season.status === 5;
                var isRequested = season.status >= 2 && season.status < 5;
                var statusClass = isAvailable ? 'season-available' : (isRequested ? 'season-requested' : '');
                var statusText = isAvailable ? ' (Available)' : (isRequested ? ' (Requested)' : '');
                var disabled = isAvailable || isRequested ? ' disabled' : '';

                html += '<label class="season-option focusable ' + statusClass + '" tabindex="0">';
                html += '<input type="checkbox" class="season-checkbox" value="' + season.seasonNumber + '"' + disabled + '>';
                html += '<span class="season-option-label">';
                html += 'Season ' + season.seasonNumber;
                if (season.episodeCount) html += ' (' + season.episodeCount + ' episodes)';
                html += statusText;
                html += '</span>';
                html += '</label>';
            });
            html += '</div>';

            // Action buttons
            html += '<div class="season-selection-actions">';
            html += '<button class="btn btn-secondary focusable" id="season-cancel-btn">Cancel</button>';
            html += '<button class="btn btn-request focusable" id="season-request-btn" disabled>Request Selected</button>';
            html += '</div>';

            html += '</div>';

            // Store for later use
            this.pendingTvRequest = {
                tmdbId: tvShow.id,
                name: tvShow.name || tvShow.title
            };

            // Update modal content
            var contentEl = document.getElementById('modal-content');
            if (contentEl) {
                contentEl.innerHTML = html;
            }

            // Bind events
            this.bindSeasonSelectionEvents();

            // Focus first option
            setTimeout(function() {
                var firstOption = document.querySelector('.season-option.focusable');
                if (firstOption && window.FocusManager) {
                    window.FocusManager.setFocus(firstOption);
                }
            }, 100);
        },

        /**
         * Bind season selection modal events
         */
        bindSeasonSelectionEvents: function() {
            var self = this;

            // Close button
            var closeBtn = document.getElementById('season-modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    self.close();
                });
            }

            // Cancel button
            var cancelBtn = document.getElementById('season-cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function() {
                    self.close();
                });
            }

            // Select all checkbox
            var selectAllCheckbox = document.getElementById('select-all-seasons');
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', function() {
                    var checked = this.checked;
                    var seasonCheckboxes = document.querySelectorAll('.season-checkbox:not(:disabled)');
                    seasonCheckboxes.forEach(function(cb) {
                        cb.checked = checked;
                    });
                    self.updateRequestButtonState();
                });
            }

            // Individual season checkboxes
            var seasonCheckboxes = document.querySelectorAll('.season-checkbox');
            seasonCheckboxes.forEach(function(cb) {
                cb.addEventListener('change', function() {
                    // Uncheck "all" if individual is unchecked
                    if (!this.checked && selectAllCheckbox) {
                        selectAllCheckbox.checked = false;
                    }
                    self.updateRequestButtonState();
                });
            });

            // Season option labels (for keyboard/focus)
            var seasonOptions = document.querySelectorAll('.season-option');
            seasonOptions.forEach(function(option) {
                option.addEventListener('click', function(e) {
                    if (e.target.tagName !== 'INPUT') {
                        var checkbox = this.querySelector('input[type="checkbox"]');
                        if (checkbox && !checkbox.disabled) {
                            checkbox.checked = !checkbox.checked;
                            checkbox.dispatchEvent(new Event('change'));
                        }
                    }
                });
                option.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        var checkbox = this.querySelector('input[type="checkbox"]');
                        if (checkbox && !checkbox.disabled) {
                            checkbox.checked = !checkbox.checked;
                            checkbox.dispatchEvent(new Event('change'));
                        }
                    }
                });
            });

            // Request button
            var requestBtn = document.getElementById('season-request-btn');
            if (requestBtn) {
                requestBtn.addEventListener('click', function() {
                    self.submitSeasonRequest();
                });
            }
        },

        /**
         * Update request button enabled state
         */
        updateRequestButtonState: function() {
            var requestBtn = document.getElementById('season-request-btn');
            if (!requestBtn) return;

            var selectAll = document.getElementById('select-all-seasons');
            var seasonCheckboxes = document.querySelectorAll('.season-checkbox:checked');

            var hasSelection = (selectAll && selectAll.checked) || seasonCheckboxes.length > 0;
            requestBtn.disabled = !hasSelection;
        },

        /**
         * Submit the season request
         */
        submitSeasonRequest: function() {
            var self = this;
            var selectAll = document.getElementById('select-all-seasons');
            var seasonCheckboxes = document.querySelectorAll('.season-checkbox:checked');

            var seasons = [];
            if (selectAll && selectAll.checked) {
                // Request all seasons - pass 'all' indicator
                seasons = 'all';
            } else {
                // Get selected season numbers
                seasonCheckboxes.forEach(function(cb) {
                    seasons.push(parseInt(cb.value, 10));
                });
            }

            if (!this.pendingTvRequest) {
                console.error('ModalManager: No pending TV request');
                return;
            }

            this.submitRequest(this.pendingTvRequest.tmdbId, 'tv', seasons);
        },

        /**
         * Submit the actual request to Jellyseerr
         */
        submitRequest: function(mediaId, mediaType, seasons) {
            var self = this;
            console.log('ModalManager: Submitting request', mediaId, mediaType, seasons);

            var requestBtn = document.querySelector('[data-action="request"]') || document.getElementById('season-request-btn');
            if (requestBtn) {
                requestBtn.textContent = 'Requesting...';
                requestBtn.disabled = true;
            }

            // Prepare seasons array for API
            // When seasons is 'all' or null/undefined, don't pass seasons (requests all)
            // When seasons is an array of numbers, pass it to request specific seasons
            var seasonsParam = null;
            if (mediaType === 'tv' && Array.isArray(seasons) && seasons.length > 0) {
                seasonsParam = seasons;
            }

            console.log('ModalManager: Final request params', { mediaId: mediaId, mediaType: mediaType, seasons: seasonsParam });

            window.JellyseerrClient.requestMedia(mediaType, parseInt(mediaId), seasonsParam)
                .then(function(result) {
                    console.log('ModalManager: Request successful', result);

                    if (requestBtn) {
                        requestBtn.textContent = 'Requested!';
                        requestBtn.classList.remove('btn-request');
                        requestBtn.classList.add('btn-secondary');
                    }

                    // Update status badge if visible
                    var badge = document.querySelector('.status-badge');
                    if (badge) {
                        badge.textContent = 'Requested';
                        badge.className = 'status-badge status-pending';
                    }

                    // Show success message and close after delay
                    setTimeout(function() {
                        self.close();
                    }, 1500);
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
