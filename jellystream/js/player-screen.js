/**
 * JellyStream - Player Screen
 * Video playback with TV remote controls
 */
(function(window, document) {
    'use strict';

    var PlayerScreen = {
        initialized: false,
        videoElement: null,
        mediaInfo: null,
        mediaItem: null, // Full item data for pause overlay
        playSessionId: null,

        // Playback state
        isPlaying: false,
        isPaused: false,
        currentPosition: 0,
        duration: 0,

        // Progress reporting interval
        progressInterval: null,
        PROGRESS_INTERVAL_MS: 10000, // Report every 10 seconds

        // Seek amounts in seconds
        SEEK_SMALL: 10,
        SEEK_LARGE: 30,

        // Controls visibility
        controlsVisible: false,
        controlsTimeout: null,
        CONTROLS_HIDE_DELAY: 4000,

        // Pause overlay
        pauseOverlayVisible: false,
        pauseOverlayTimeout: null,
        PAUSE_OVERLAY_DELAY: 15000, // 15 seconds before showing pause overlay

        // Track selection
        audioTracks: [],
        subtitleTracks: [],
        currentAudioIndex: 0,
        currentSubtitleIndex: -1, // -1 means no subtitles
        tracksMenuVisible: false,

        // Settings state
        settingsMenuVisible: false,
        playbackSpeed: 1.0,
        aspectRatio: 'auto',
        repeatMode: 'none', // none, one, all
        currentQuality: 'auto', // auto or bitrate in bps
        qualityOptions: [
            { label: 'Auto', value: 'auto' },
            { label: '120 Mbps (4K Max)', value: 120000000 },
            { label: '80 Mbps', value: 80000000 },
            { label: '60 Mbps', value: 60000000 },
            { label: '40 Mbps (1080p)', value: 40000000 },
            { label: '20 Mbps', value: 20000000 },
            { label: '10 Mbps (720p)', value: 10000000 },
            { label: '4 Mbps', value: 4000000 },
            { label: '2 Mbps', value: 2000000 },
            { label: '420 Kbps (Low)', value: 420000 }
        ],

        /**
         * Initialize player screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('PlayerScreen: Initializing');

            this.videoElement = document.getElementById('player-video');
            if (!this.videoElement) {
                console.error('PlayerScreen: Video element not found');
                return;
            }

            this.bindVideoEvents();
            this.bindKeyboardEvents();
            this.bindControlButtons();
            this.initialized = true;

            console.log('PlayerScreen: Initialized');
        },

        /**
         * Load and start playback
         */
        load: function() {
            console.log('PlayerScreen: Loading');

            var state = window.StateManager;
            if (!state || !state.playback.currentMediaId) {
                console.error('PlayerScreen: No media to play');
                this.showError('No media selected');
                return;
            }

            var mediaId = state.playback.currentMediaId;
            console.log('PlayerScreen: Loading media', mediaId);

            // Reset resume position preference
            this.startFromBeginning = false;

            this.showLoading(true);
            this.loadMedia(mediaId);
        },

        /**
         * Load media from Jellyfin
         */
        loadMedia: function(mediaId) {
            var self = this;

            // First get the item details for the title and pause overlay
            window.JellyfinClient.getItem(mediaId)
                .then(function(item) {
                    // Store full item data for pause overlay
                    self.mediaItem = item;

                    // Set the title
                    var title = item.Name || 'Unknown';
                    if (item.Type === 'Episode' && item.SeriesName) {
                        title = item.SeriesName + ' - ' + title;
                    }
                    var titleEl = document.getElementById('player-title');
                    if (titleEl) {
                        titleEl.textContent = title;
                    }

                    // Store resume position from item data
                    var resumePosition = 0;
                    if (item.UserData && item.UserData.PlaybackPositionTicks) {
                        resumePosition = item.UserData.PlaybackPositionTicks;
                        window.StateManager.playback.resumePosition = resumePosition;
                    }

                    // Check if we should show resume prompt (more than 30 seconds in, and not already watched)
                    var resumeSeconds = resumePosition / 10000000;
                    var shouldPrompt = resumeSeconds > 30 && (!item.UserData || !item.UserData.Played);

                    if (shouldPrompt && !self.startFromBeginning) {
                        self.showResumePrompt(resumeSeconds, item);
                        return Promise.reject({ isPrompt: true }); // Stop the chain - prompt will handle it
                    }

                    // Now get playback info
                    return window.JellyfinClient.getPlaybackInfo(mediaId);
                })
                .then(function(playbackInfo) {
                    console.log('PlayerScreen: Got playback info', playbackInfo);

                    if (!playbackInfo.MediaSources || playbackInfo.MediaSources.length === 0) {
                        throw new Error('No media sources available');
                    }

                    self.mediaInfo = playbackInfo.MediaSources[0];
                    self.playSessionId = playbackInfo.PlaySessionId;

                    // Extract audio and subtitle tracks
                    self.extractTracks(self.mediaInfo);

                    // Get stream URL
                    var streamUrl = self.getStreamUrl(mediaId, self.mediaInfo);
                    console.log('PlayerScreen: Stream URL', streamUrl);

                    // Set up video
                    self.videoElement.src = streamUrl;

                    // Resume from last position if available (and not starting from beginning)
                    var resumePosition = window.StateManager.playback.resumePosition || 0;

                    if (resumePosition > 0 && !self.startFromBeginning) {
                        self.videoElement.currentTime = resumePosition / 10000000; // Ticks to seconds
                        console.log('PlayerScreen: Resuming from', self.videoElement.currentTime, 'seconds');
                    }

                    // Load metadata, then play
                    self.videoElement.load();
                })
                .catch(function(error) {
                    if (error && error.isPrompt) {
                        // Not an error - just showing the prompt
                        return;
                    }
                    console.error('PlayerScreen: Failed to get playback info', error);
                    self.showError('Failed to load video: ' + error.message);
                });
        },

        /**
         * Show resume prompt dialog
         */
        showResumePrompt: function(resumeSeconds, item) {
            var self = this;
            this.showLoading(false);

            var formattedTime = this.formatTime(resumeSeconds);

            // Create prompt overlay
            var overlay = document.createElement('div');
            overlay.id = 'resume-prompt';
            overlay.className = 'resume-prompt-overlay';
            overlay.innerHTML =
                '<div class="resume-prompt-dialog">' +
                    '<h2>Resume Playback?</h2>' +
                    '<p>You were watching at <strong>' + formattedTime + '</strong></p>' +
                    '<div class="resume-prompt-buttons">' +
                        '<button class="btn btn-primary focusable" id="resume-btn">Resume</button>' +
                        '<button class="btn btn-secondary focusable" id="start-over-btn">Start Over</button>' +
                    '</div>' +
                '</div>';

            document.getElementById('player-screen').appendChild(overlay);

            // Focus resume button
            setTimeout(function() {
                var resumeBtn = document.getElementById('resume-btn');
                if (resumeBtn && window.FocusManager) {
                    window.FocusManager.setFocus(resumeBtn);
                }
            }, 100);

            // Bind button events
            document.getElementById('resume-btn').addEventListener('click', function() {
                self.closeResumePrompt();
                self.startFromBeginning = false;
                self.showLoading(true);
                self.continueLoadMedia(window.StateManager.playback.currentMediaId);
            });

            document.getElementById('start-over-btn').addEventListener('click', function() {
                self.closeResumePrompt();
                self.startFromBeginning = true;
                window.StateManager.playback.resumePosition = 0;
                self.showLoading(true);
                self.continueLoadMedia(window.StateManager.playback.currentMediaId);
            });
        },

        /**
         * Close resume prompt
         */
        closeResumePrompt: function() {
            var prompt = document.getElementById('resume-prompt');
            if (prompt && prompt.parentNode) {
                prompt.parentNode.removeChild(prompt);
            }
        },

        /**
         * Continue loading media after resume prompt
         */
        continueLoadMedia: function(mediaId) {
            var self = this;

            window.JellyfinClient.getPlaybackInfo(mediaId)
                .then(function(playbackInfo) {
                    console.log('PlayerScreen: Got playback info', playbackInfo);

                    if (!playbackInfo.MediaSources || playbackInfo.MediaSources.length === 0) {
                        throw new Error('No media sources available');
                    }

                    self.mediaInfo = playbackInfo.MediaSources[0];
                    self.playSessionId = playbackInfo.PlaySessionId;

                    // Extract audio and subtitle tracks
                    self.extractTracks(self.mediaInfo);

                    // Get stream URL
                    var streamUrl = self.getStreamUrl(mediaId, self.mediaInfo);
                    console.log('PlayerScreen: Stream URL', streamUrl);

                    // Set up video
                    self.videoElement.src = streamUrl;

                    // Resume from last position if available (and not starting from beginning)
                    var resumePosition = window.StateManager.playback.resumePosition || 0;

                    if (resumePosition > 0 && !self.startFromBeginning) {
                        self.videoElement.currentTime = resumePosition / 10000000;
                        console.log('PlayerScreen: Resuming from', self.videoElement.currentTime, 'seconds');
                    }

                    // Load metadata, then play
                    self.videoElement.load();
                })
                .catch(function(error) {
                    console.error('PlayerScreen: Failed to get playback info', error);
                    self.showError('Failed to load video: ' + error.message);
                });
        },

        /**
         * Extract audio and subtitle tracks from media source
         */
        extractTracks: function(mediaSource) {
            this.audioTracks = [];
            this.subtitleTracks = [];

            if (!mediaSource.MediaStreams) return;

            var self = this;
            mediaSource.MediaStreams.forEach(function(stream, index) {
                if (stream.Type === 'Audio') {
                    self.audioTracks.push({
                        index: stream.Index,
                        language: stream.Language || 'Unknown',
                        displayTitle: stream.DisplayTitle || stream.Language || 'Audio ' + (self.audioTracks.length + 1),
                        codec: stream.Codec,
                        channels: stream.Channels,
                        isDefault: stream.IsDefault
                    });

                    // Set default audio track
                    if (stream.IsDefault) {
                        self.currentAudioIndex = self.audioTracks.length - 1;
                    }
                } else if (stream.Type === 'Subtitle') {
                    self.subtitleTracks.push({
                        index: stream.Index,
                        language: stream.Language || 'Unknown',
                        displayTitle: stream.DisplayTitle || stream.Language || 'Subtitle ' + (self.subtitleTracks.length + 1),
                        codec: stream.Codec,
                        isDefault: stream.IsDefault,
                        isExternal: stream.IsExternal
                    });

                    // Set default subtitle track
                    if (stream.IsDefault) {
                        self.currentSubtitleIndex = self.subtitleTracks.length - 1;
                    }
                }
            });

            console.log('PlayerScreen: Found', this.audioTracks.length, 'audio tracks,', this.subtitleTracks.length, 'subtitle tracks');

            // Update tracks button visibility
            var tracksBtn = document.getElementById('tracks-btn');
            if (tracksBtn) {
                tracksBtn.style.display = (this.audioTracks.length > 1 || this.subtitleTracks.length > 0) ? 'block' : 'none';
            }
        },

        /**
         * Toggle tracks selection menu
         */
        toggleTracksMenu: function() {
            if (this.tracksMenuVisible) {
                this.closeTracksMenu();
            } else {
                this.openTracksMenu();
            }
        },

        /**
         * Open tracks selection menu
         */
        openTracksMenu: function() {
            var self = this;
            this.tracksMenuVisible = true;

            // Hide pause overlay if visible (we're opening tracks menu instead)
            this.hidePauseOverlay();

            // Clear pause overlay timer while in menu
            if (this.pauseOverlayTimeout) {
                clearTimeout(this.pauseOverlayTimeout);
                this.pauseOverlayTimeout = null;
            }

            // Pause video while menu is open (but don't show pause overlay)
            if (this.videoElement && !this.videoElement.paused) {
                this.videoElement.pause();
            }

            // Create menu overlay
            var overlay = document.createElement('div');
            overlay.id = 'tracks-menu';
            overlay.className = 'tracks-menu-overlay';

            var html = '<div class="tracks-menu-dialog">';
            html += '<h2>Audio & Subtitles</h2>';

            // Audio section
            if (this.audioTracks.length > 0) {
                html += '<div class="tracks-section">';
                html += '<h3>Audio</h3>';
                html += '<div class="tracks-list">';
                this.audioTracks.forEach(function(track, index) {
                    var isActive = index === self.currentAudioIndex;
                    html += '<button class="track-item focusable' + (isActive ? ' active' : '') + '" ';
                    html += 'data-type="audio" data-index="' + index + '">';
                    html += '<span class="track-title">' + self.escapeHtml(track.displayTitle) + '</span>';
                    if (track.channels) {
                        html += '<span class="track-info">' + track.channels + ' ch</span>';
                    }
                    if (isActive) {
                        html += '<span class="track-check">&#10003;</span>';
                    }
                    html += '</button>';
                });
                html += '</div></div>';
            }

            // Subtitle section
            html += '<div class="tracks-section">';
            html += '<h3>Subtitles</h3>';
            html += '<div class="tracks-list">';

            // "Off" option
            var isOff = this.currentSubtitleIndex === -1;
            html += '<button class="track-item focusable' + (isOff ? ' active' : '') + '" ';
            html += 'data-type="subtitle" data-index="-1">';
            html += '<span class="track-title">Off</span>';
            if (isOff) {
                html += '<span class="track-check">&#10003;</span>';
            }
            html += '</button>';

            this.subtitleTracks.forEach(function(track, index) {
                var isActive = index === self.currentSubtitleIndex;
                html += '<button class="track-item focusable' + (isActive ? ' active' : '') + '" ';
                html += 'data-type="subtitle" data-index="' + index + '">';
                html += '<span class="track-title">' + self.escapeHtml(track.displayTitle) + '</span>';
                if (isActive) {
                    html += '<span class="track-check">&#10003;</span>';
                }
                html += '</button>';
            });

            html += '</div></div>';

            // Close button
            html += '<button class="btn btn-secondary focusable" id="tracks-close-btn">Close</button>';
            html += '</div>';

            overlay.innerHTML = html;
            document.getElementById('player-screen').appendChild(overlay);

            // Bind events
            this.bindTracksMenuEvents();

            // Focus first item
            setTimeout(function() {
                var firstItem = document.querySelector('.track-item.focusable');
                if (firstItem && window.FocusManager) {
                    window.FocusManager.setFocus(firstItem);
                }
            }, 100);
        },

        /**
         * Bind tracks menu events
         */
        bindTracksMenuEvents: function() {
            var self = this;

            // Track items
            var trackItems = document.querySelectorAll('.track-item');
            trackItems.forEach(function(item) {
                item.addEventListener('click', function() {
                    var type = this.dataset.type;
                    var index = parseInt(this.dataset.index, 10);
                    self.selectTrack(type, index);
                });
            });

            // Close button
            var closeBtn = document.getElementById('tracks-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    self.closeTracksMenu();
                });
            }

            // Close on escape
            document.addEventListener('keydown', function handler(e) {
                if (e.key === 'Escape' && self.tracksMenuVisible) {
                    e.preventDefault();
                    self.closeTracksMenu();
                    document.removeEventListener('keydown', handler);
                }
            });
        },

        /**
         * Select a track
         */
        selectTrack: function(type, index) {
            console.log('PlayerScreen: Selecting', type, 'track', index);

            if (type === 'audio') {
                this.currentAudioIndex = index;
                // Note: Changing audio track mid-stream requires re-requesting the stream
                // For now, we'll just update the UI - full implementation would need stream reload
            } else if (type === 'subtitle') {
                this.currentSubtitleIndex = index;
                this.applySubtitleTrack();
            }

            // Update UI
            var items = document.querySelectorAll('.track-item[data-type="' + type + '"]');
            items.forEach(function(item) {
                var itemIndex = parseInt(item.dataset.index, 10);
                item.classList.toggle('active', itemIndex === index);

                // Update checkmark
                var existingCheck = item.querySelector('.track-check');
                if (existingCheck) {
                    existingCheck.remove();
                }
                if (itemIndex === index) {
                    var check = document.createElement('span');
                    check.className = 'track-check';
                    check.innerHTML = '&#10003;';
                    item.appendChild(check);
                }
            });
        },

        /**
         * Apply subtitle track selection
         */
        applySubtitleTrack: function() {
            var video = this.videoElement;
            if (!video) return;

            // Remove existing subtitle tracks
            var existingTracks = video.querySelectorAll('track');
            existingTracks.forEach(function(track) {
                track.remove();
            });

            // If subtitles are off, we're done
            if (this.currentSubtitleIndex === -1) {
                console.log('PlayerScreen: Subtitles disabled');
                return;
            }

            // Get the subtitle track info
            var subTrack = this.subtitleTracks[this.currentSubtitleIndex];
            if (!subTrack) return;

            // Create and add subtitle track
            var mediaId = window.StateManager.playback.currentMediaId;
            var serverUrl = window.StateManager.jellyfin.serverUrl;
            var accessToken = window.StateManager.jellyfin.accessToken;

            // Request VTT format subtitle - use mediaSourceId from mediaInfo
            var mediaSourceId = this.mediaInfo.Id || mediaId;
            var subtitleUrl = serverUrl + '/Videos/' + mediaId + '/' + mediaSourceId + '/Subtitles/' + subTrack.index + '/Stream.vtt';
            subtitleUrl += '?api_key=' + accessToken;

            console.log('PlayerScreen: Loading subtitle from', subtitleUrl);

            var self = this;

            // Fetch subtitle file to avoid CORS issues with track element
            fetch(subtitleUrl)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Failed to fetch subtitle: ' + response.status);
                    }
                    return response.text();
                })
                .then(function(vttContent) {
                    console.log('PlayerScreen: Subtitle fetched, length:', vttContent.length);

                    // Create blob URL from the VTT content
                    var blob = new Blob([vttContent], { type: 'text/vtt' });
                    var blobUrl = URL.createObjectURL(blob);

                    var track = document.createElement('track');
                    track.kind = 'captions';
                    track.label = subTrack.displayTitle;
                    track.srclang = subTrack.language || 'en';
                    track.src = blobUrl;
                    track.default = true;

                    track.addEventListener('error', function(e) {
                        console.error('PlayerScreen: Subtitle track failed to load', e);
                    });

                    track.addEventListener('load', function() {
                        console.log('PlayerScreen: Subtitle track loaded successfully');
                    });

                    video.appendChild(track);

                    // Enable the track after a short delay
                    setTimeout(function() {
                        if (video.textTracks && video.textTracks.length > 0) {
                            for (var i = 0; i < video.textTracks.length; i++) {
                                video.textTracks[i].mode = 'showing';
                            }
                            console.log('PlayerScreen: Subtitle track enabled, count:', video.textTracks.length);
                        }
                    }, 100);
                })
                .catch(function(error) {
                    console.error('PlayerScreen: Failed to load subtitle', error);
                });
        },

        /**
         * Close tracks menu
         */
        closeTracksMenu: function() {
            this.tracksMenuVisible = false;

            var menu = document.getElementById('tracks-menu');
            if (menu && menu.parentNode) {
                menu.parentNode.removeChild(menu);
            }

            // Resume playback
            this.play();
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
         * Get stream URL for media
         */
        getStreamUrl: function(mediaId, mediaSource) {
            var baseUrl = window.StateManager.jellyfin.serverUrl;
            var accessToken = window.StateManager.jellyfin.accessToken;
            var container = mediaSource.Container || 'mp4';

            // If quality is auto or max, use direct stream
            if (this.currentQuality === 'auto' || this.currentQuality >= 120000000) {
                // Direct stream URL (works for most formats on Tizen/browsers)
                return baseUrl + '/Videos/' + mediaId + '/stream' +
                    '?static=true' +
                    '&mediaSourceId=' + mediaSource.Id +
                    '&api_key=' + accessToken;
            }

            // Use transcoded stream with bitrate limit
            var url = baseUrl + '/Videos/' + mediaId + '/stream' +
                '?mediaSourceId=' + mediaSource.Id +
                '&api_key=' + accessToken +
                '&maxStreamingBitrate=' + this.currentQuality +
                '&audioBitrate=384000' +
                '&videoCodec=h264' +
                '&audioCodec=aac' +
                '&container=ts';

            console.log('PlayerScreen: Using transcoded stream with bitrate', this.currentQuality);
            return url;
        },

        /**
         * Bind video element events
         */
        bindVideoEvents: function() {
            var self = this;
            var video = this.videoElement;

            video.addEventListener('loadedmetadata', function() {
                console.log('PlayerScreen: Metadata loaded, duration:', video.duration);
                self.duration = video.duration;
                self.updateDurationDisplay();
                self.updateRatingDisplay();
                self.updateFavoriteButton();
                self.showLoading(false);
            });

            video.addEventListener('canplay', function() {
                console.log('PlayerScreen: Can play');
                // Auto-play when ready
                self.play();
            });

            video.addEventListener('play', function() {
                console.log('PlayerScreen: Playing');
                self.isPlaying = true;
                self.isPaused = false;
                self.updatePlayPauseButton();
                self.startProgressReporting();
                self.reportPlaybackStart();
                // Cancel any pending pause overlay timeout
                if (self.pauseOverlayTimeout) {
                    clearTimeout(self.pauseOverlayTimeout);
                    self.pauseOverlayTimeout = null;
                }
                self.hidePauseOverlay();
                // Schedule controls to hide after delay (not immediately)
                self.showControls();
            });

            video.addEventListener('pause', function() {
                console.log('PlayerScreen: Paused');
                self.isPaused = true;
                self.updatePlayPauseButton();
                self.reportProgress();
                // Show controls immediately, and start inactivity timer for pause overlay
                self.showControls();
                self.resetPauseOverlayTimer();
            });

            video.addEventListener('timeupdate', function() {
                self.currentPosition = video.currentTime;
                self.updateProgressBar();
                self.updateTimeDisplay();
            });

            video.addEventListener('ended', function() {
                console.log('PlayerScreen: Ended');
                self.isPlaying = false;
                self.stopProgressReporting();
                self.reportPlaybackStopped();

                // Go back to previous screen
                setTimeout(function() {
                    if (window.Router) {
                        window.Router.goBack();
                    }
                }, 1000);
            });

            video.addEventListener('error', function(e) {
                var error = video.error;
                var errorMessage = 'Video playback error';
                var errorDetails = {
                    code: error ? error.code : 'unknown',
                    message: error ? error.message : 'No error details',
                    networkState: video.networkState,
                    readyState: video.readyState,
                    currentSrc: video.currentSrc ? video.currentSrc.substring(0, 100) + '...' : 'none'
                };

                // Decode error code
                if (error) {
                    switch (error.code) {
                        case 1: errorMessage = 'Video loading aborted'; break;
                        case 2: errorMessage = 'Network error while loading video'; break;
                        case 3: errorMessage = 'Video decoding failed'; break;
                        case 4: errorMessage = 'Video format not supported'; break;
                    }
                }

                console.error('PlayerScreen: Video error', errorMessage, errorDetails);
                self.showError(errorMessage);
            });

            video.addEventListener('waiting', function() {
                self.showLoading(true);
            });

            video.addEventListener('playing', function() {
                self.showLoading(false);
            });
        },

        /**
         * Bind control button click events
         */
        bindControlButtons: function() {
            var self = this;

            var playPauseBtn = document.getElementById('play-pause-btn');
            var rewindBtn = document.getElementById('rewind-btn');
            var forwardBtn = document.getElementById('forward-btn');
            var tracksBtn = document.getElementById('tracks-btn');
            var favoriteBtn = document.getElementById('favorite-btn');
            var volumeBtn = document.getElementById('volume-btn');
            var volumeSlider = document.getElementById('volume-slider');
            var settingsBtn = document.getElementById('settings-btn');
            var fullscreenBtn = document.getElementById('fullscreen-btn');

            if (playPauseBtn) {
                playPauseBtn.addEventListener('click', function() {
                    self.togglePlayPause();
                });
            }

            if (rewindBtn) {
                rewindBtn.addEventListener('click', function() {
                    self.seekBackward(self.SEEK_SMALL);
                });
            }

            if (forwardBtn) {
                forwardBtn.addEventListener('click', function() {
                    self.seekForward(self.SEEK_SMALL);
                });
            }

            if (tracksBtn) {
                tracksBtn.addEventListener('click', function() {
                    self.toggleTracksMenu();
                });
            }

            // Favorite button
            if (favoriteBtn) {
                favoriteBtn.addEventListener('click', function() {
                    self.toggleFavorite();
                });
            }

            // Volume controls
            if (volumeBtn) {
                volumeBtn.addEventListener('click', function() {
                    self.toggleMute();
                });
            }

            if (volumeSlider) {
                volumeSlider.addEventListener('input', function() {
                    self.setVolume(this.value / 100);
                });
            }

            // Settings button
            if (settingsBtn) {
                settingsBtn.addEventListener('click', function() {
                    self.toggleSettingsMenu();
                });
            }

            // Fullscreen button (TVs are usually always fullscreen)
            if (fullscreenBtn) {
                fullscreenBtn.addEventListener('click', function() {
                    self.toggleFullscreen();
                });
            }
        },

        /**
         * Bind keyboard/remote events
         */
        bindKeyboardEvents: function() {
            var self = this;

            document.addEventListener('keydown', function(e) {
                // Only handle when player screen is active
                if (window.StateManager && window.StateManager.ui.currentScreen !== 'player-screen') {
                    return;
                }

                // Reset pause overlay timer on any key press while paused
                if (self.isPaused && !self.pauseOverlayVisible) {
                    self.resetPauseOverlayTimer();
                }

                // If pause overlay is visible, handle differently
                if (self.pauseOverlayVisible) {
                    // Enter/Space resumes playback (unless on a button)
                    if ((e.key === 'Enter' || e.key === ' ') && !e.target.classList.contains('focusable')) {
                        e.preventDefault();
                        self.play();
                        return;
                    }
                    // Let other keys pass through for button navigation
                    return;
                }

                // Show controls on any key press during playback
                self.showControls();

                switch (e.key) {
                    case 'Enter':
                    case ' ':
                        e.preventDefault();
                        self.togglePlayPause();
                        break;

                    case 'ArrowLeft':
                        e.preventDefault();
                        self.seekBackward(self.SEEK_SMALL);
                        break;

                    case 'ArrowRight':
                        e.preventDefault();
                        self.seekForward(self.SEEK_SMALL);
                        break;

                    case 'ArrowUp':
                        e.preventDefault();
                        self.seekForward(self.SEEK_LARGE);
                        break;

                    case 'ArrowDown':
                        e.preventDefault();
                        self.seekBackward(self.SEEK_LARGE);
                        break;

                    case 'MediaPlayPause':
                        e.preventDefault();
                        self.togglePlayPause();
                        break;

                    case 'MediaPlay':
                        e.preventDefault();
                        self.play();
                        break;

                    case 'MediaPause':
                        e.preventDefault();
                        self.pause();
                        break;

                    case 'MediaStop':
                        e.preventDefault();
                        self.stop();
                        break;

                    case 'MediaFastForward':
                        e.preventDefault();
                        self.seekForward(self.SEEK_LARGE);
                        break;

                    case 'MediaRewind':
                        e.preventDefault();
                        self.seekBackward(self.SEEK_LARGE);
                        break;
                }
            });
        },

        /**
         * Play video
         */
        play: function() {
            if (this.videoElement) {
                var playPromise = this.videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(function(error) {
                        console.error('PlayerScreen: Play failed', error);
                    });
                }
            }
        },

        /**
         * Pause video
         */
        pause: function() {
            if (this.videoElement) {
                this.videoElement.pause();
            }
        },

        /**
         * Toggle play/pause
         */
        togglePlayPause: function() {
            if (this.isPaused || !this.isPlaying) {
                this.play();
            } else {
                this.pause();
            }
        },

        /**
         * Stop playback and go back
         */
        stop: function() {
            console.log('PlayerScreen: Stopping');

            this.reportPlaybackStopped();
            this.stopProgressReporting();

            // Clear pause overlay timeout
            if (this.pauseOverlayTimeout) {
                clearTimeout(this.pauseOverlayTimeout);
                this.pauseOverlayTimeout = null;
            }
            this.hidePauseOverlay();

            if (this.videoElement) {
                this.videoElement.pause();
                this.videoElement.src = '';
            }

            this.isPlaying = false;
            this.isPaused = false;

            if (window.Router) {
                window.Router.goBack();
            }
        },

        /**
         * Seek forward by seconds
         */
        seekForward: function(seconds) {
            if (this.videoElement) {
                var newTime = Math.min(this.videoElement.currentTime + seconds, this.duration);
                this.videoElement.currentTime = newTime;
                this.showSeekIndicator('+' + seconds + 's');
            }
        },

        /**
         * Seek backward by seconds
         */
        seekBackward: function(seconds) {
            if (this.videoElement) {
                var newTime = Math.max(this.videoElement.currentTime - seconds, 0);
                this.videoElement.currentTime = newTime;
                this.showSeekIndicator('-' + seconds + 's');
            }
        },

        /**
         * Save current position (called when app pauses)
         */
        savePosition: function() {
            if (window.StateManager && this.videoElement) {
                window.StateManager.playback.resumePosition = Math.floor(this.videoElement.currentTime * 10000000);
            }
        },

        /**
         * Resume playback (called when app resumes)
         */
        resume: function() {
            this.play();
        },

        /**
         * Report playback start to Jellyfin
         */
        reportPlaybackStart: function() {
            var mediaId = window.StateManager.playback.currentMediaId;
            var positionTicks = Math.floor(this.currentPosition * 10000000);

            window.JellyfinClient.reportPlaybackStart(mediaId, positionTicks)
                .then(function() {
                    console.log('PlayerScreen: Reported playback start');
                })
                .catch(function(error) {
                    console.error('PlayerScreen: Failed to report playback start', error);
                });
        },

        /**
         * Report playback progress to Jellyfin
         */
        reportProgress: function() {
            var mediaId = window.StateManager.playback.currentMediaId;
            var positionTicks = Math.floor(this.currentPosition * 10000000);

            window.JellyfinClient.reportPlaybackProgress(mediaId, positionTicks, this.isPaused)
                .catch(function(error) {
                    console.error('PlayerScreen: Failed to report progress', error);
                });
        },

        /**
         * Report playback stopped to Jellyfin
         */
        reportPlaybackStopped: function() {
            var mediaId = window.StateManager.playback.currentMediaId;
            var positionTicks = Math.floor(this.currentPosition * 10000000);

            window.JellyfinClient.reportPlaybackStopped(mediaId, positionTicks)
                .then(function() {
                    console.log('PlayerScreen: Reported playback stopped');
                })
                .catch(function(error) {
                    console.error('PlayerScreen: Failed to report playback stopped', error);
                });
        },

        /**
         * Start progress reporting interval
         */
        startProgressReporting: function() {
            var self = this;
            this.stopProgressReporting();

            this.progressInterval = setInterval(function() {
                if (self.isPlaying && !self.isPaused) {
                    self.reportProgress();
                }
            }, this.PROGRESS_INTERVAL_MS);
        },

        /**
         * Stop progress reporting interval
         */
        stopProgressReporting: function() {
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            }
        },

        /**
         * Show/hide player controls
         */
        showControls: function() {
            var self = this;
            var controls = document.querySelector('.player-controls');

            if (controls) {
                controls.classList.add('visible');
                this.controlsVisible = true;
            }

            // Auto-hide after delay
            if (this.controlsTimeout) {
                clearTimeout(this.controlsTimeout);
            }

            this.controlsTimeout = setTimeout(function() {
                if (self.isPlaying && !self.isPaused) {
                    self.hideControls();
                }
            }, this.CONTROLS_HIDE_DELAY);
        },

        /**
         * Hide player controls
         */
        hideControls: function() {
            var controls = document.querySelector('.player-controls');
            if (controls) {
                controls.classList.remove('visible');
                this.controlsVisible = false;
            }
        },

        /**
         * Reset pause overlay inactivity timer
         * Called on any user interaction while paused
         */
        resetPauseOverlayTimer: function() {
            var self = this;

            // Clear existing timeout
            if (this.pauseOverlayTimeout) {
                clearTimeout(this.pauseOverlayTimeout);
                this.pauseOverlayTimeout = null;
            }

            // Only schedule if paused and overlay not already visible
            if (this.isPaused && !this.pauseOverlayVisible) {
                this.pauseOverlayTimeout = setTimeout(function() {
                    // Only show if still paused, no menus open
                    if (self.isPaused && !self.tracksMenuVisible && !self.settingsMenuVisible) {
                        self.showPauseOverlay();
                    }
                }, this.PAUSE_OVERLAY_DELAY);
            }
        },

        /**
         * Update play/pause button state
         */
        updatePlayPauseButton: function() {
            var btn = document.getElementById('play-pause-btn');
            if (btn) {
                var playIcon = btn.querySelector('.play-icon');
                var pauseIcon = btn.querySelector('.pause-icon');
                if (playIcon && pauseIcon) {
                    playIcon.style.display = this.isPaused ? 'block' : 'none';
                    pauseIcon.style.display = this.isPaused ? 'none' : 'block';
                }
            }

            // Update state manager
            if (window.StateManager) {
                window.StateManager.playback.isPlaying = this.isPlaying;
                window.StateManager.playback.isPaused = this.isPaused;
            }
        },

        /**
         * Update progress bar
         */
        updateProgressBar: function() {
            var progressBar = document.getElementById('progress-bar');
            var progressThumb = document.getElementById('progress-thumb');

            if (this.duration > 0) {
                var percent = (this.currentPosition / this.duration) * 100;

                if (progressBar) {
                    progressBar.style.width = percent + '%';
                }

                if (progressThumb) {
                    progressThumb.style.left = percent + '%';
                }

                // Update percentage display
                var percentEl = document.getElementById('progress-percent');
                if (percentEl) {
                    var percentSpan = percentEl.querySelector('span');
                    if (percentSpan) {
                        percentSpan.textContent = Math.round(percent) + '%';
                    }
                }

                // Update "Ends at" display
                var endsAtEl = document.getElementById('ends-at');
                if (endsAtEl) {
                    var remaining = this.duration - this.currentPosition;
                    endsAtEl.textContent = this.calculateEndsAt(remaining);
                }
            }
        },

        /**
         * Update rating display
         */
        updateRatingDisplay: function() {
            var ratingEl = document.getElementById('media-rating');
            if (ratingEl && this.mediaItem) {
                var ratingSpan = ratingEl.querySelector('span');
                if (ratingSpan) {
                    var rating = this.mediaItem.CommunityRating;
                    ratingSpan.textContent = rating ? rating.toFixed(1) : '--';
                }
            }
        },

        /**
         * Update favorite button state
         */
        updateFavoriteButton: function() {
            var favoriteBtn = document.getElementById('favorite-btn');
            if (favoriteBtn && this.mediaItem && this.mediaItem.UserData) {
                if (this.mediaItem.UserData.IsFavorite) {
                    favoriteBtn.classList.add('favorited');
                } else {
                    favoriteBtn.classList.remove('favorited');
                }
            }
        },

        /**
         * Update time display
         */
        updateTimeDisplay: function() {
            var currentEl = document.getElementById('current-time');
            var remainingEl = document.getElementById('remaining-time');

            if (currentEl) {
                currentEl.textContent = this.formatTime(this.currentPosition);
            }

            if (remainingEl && this.duration > 0) {
                var remaining = this.duration - this.currentPosition;
                remainingEl.textContent = '-' + this.formatTime(remaining);
            }
        },

        /**
         * Update duration display
         */
        updateDurationDisplay: function() {
            var durationEl = document.getElementById('duration-time');
            if (durationEl) {
                durationEl.textContent = this.formatTime(this.duration);
            }
        },

        /**
         * Format time in seconds to MM:SS or HH:MM:SS
         */
        formatTime: function(seconds) {
            if (isNaN(seconds) || seconds < 0) return '0:00';

            var h = Math.floor(seconds / 3600);
            var m = Math.floor((seconds % 3600) / 60);
            var s = Math.floor(seconds % 60);

            if (h > 0) {
                return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            }
            return m + ':' + (s < 10 ? '0' : '') + s;
        },

        /**
         * Show seek indicator overlay
         */
        showSeekIndicator: function(text) {
            var indicator = document.getElementById('seek-indicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'seek-indicator';
                indicator.className = 'seek-indicator';
                document.getElementById('player-screen').appendChild(indicator);
            }

            indicator.textContent = text;
            indicator.classList.add('visible');

            setTimeout(function() {
                indicator.classList.remove('visible');
            }, 800);
        },

        /**
         * Show loading indicator
         */
        showLoading: function(show) {
            var loader = document.getElementById('player-loading');
            if (loader) {
                loader.style.display = show ? 'flex' : 'none';
            }
        },

        /**
         * Show error message
         */
        showError: function(message) {
            this.showLoading(false);

            var errorEl = document.getElementById('player-error');
            if (!errorEl) {
                errorEl = document.createElement('div');
                errorEl.id = 'player-error';
                errorEl.className = 'player-error';
                document.getElementById('player-screen').appendChild(errorEl);
            }

            errorEl.textContent = message;
            errorEl.style.display = 'block';

            // Auto-hide and go back after delay
            setTimeout(function() {
                if (window.Router) {
                    window.Router.goBack();
                }
            }, 3000);
        },

        /**
         * Show pause overlay with media info
         */
        showPauseOverlay: function() {
            // Don't show if already visible, no media data, menus are open, or video hasn't started playing yet
            if (this.pauseOverlayVisible || !this.mediaItem || this.tracksMenuVisible || this.settingsMenuVisible || !this.isPlaying) {
                console.log('PlayerScreen: Skipping pause overlay', {
                    pauseOverlayVisible: this.pauseOverlayVisible,
                    hasMediaItem: !!this.mediaItem,
                    tracksMenuVisible: this.tracksMenuVisible,
                    settingsMenuVisible: this.settingsMenuVisible,
                    isPlaying: this.isPlaying
                });
                return;
            }
            console.log('PlayerScreen: Showing pause overlay for', this.mediaItem.Name);

            var self = this;
            var item = this.mediaItem;
            var overlay = document.getElementById('pause-overlay');

            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'pause-overlay';
                overlay.className = 'pause-overlay';
                document.getElementById('player-screen').appendChild(overlay);
            }

            // Get backdrop image URL
            var backdropUrl = this.getBackdropUrl(item);

            // Build title display
            var titleHtml = '';
            if (item.Type === 'Episode' && item.SeriesName) {
                titleHtml = '<h1 class="pause-series-name">' + this.escapeHtml(item.SeriesName) + '</h1>';
                titleHtml += '<h2 class="pause-episode-title">';
                if (item.ParentIndexNumber) titleHtml += 'S' + item.ParentIndexNumber;
                if (item.IndexNumber) titleHtml += ':E' + item.IndexNumber + ' ';
                titleHtml += this.escapeHtml(item.Name) + '</h2>';
            } else {
                titleHtml = '<h1 class="pause-title">' + this.escapeHtml(item.Name) + '</h1>';
            }

            // Build metadata line
            var metaParts = [];
            if (item.ProductionYear) metaParts.push(item.ProductionYear);
            if (item.OfficialRating) metaParts.push(item.OfficialRating);
            if (item.RunTimeTicks) metaParts.push(this.formatRuntime(item.RunTimeTicks));
            var metaHtml = metaParts.length > 0 ? '<p class="pause-meta">' + metaParts.join(' &nbsp;&bull;&nbsp; ') + '</p>' : '';

            // Overview/description
            var overviewHtml = '';
            if (item.Overview) {
                var overview = item.Overview.length > 400 ? item.Overview.substring(0, 400) + '...' : item.Overview;
                overviewHtml = '<p class="pause-overview">' + this.escapeHtml(overview) + '</p>';
            }

            // Calculate progress info
            var currentTime = this.formatTime(this.currentPosition);
            var totalTime = this.formatTime(this.duration);
            var percentWatched = this.duration > 0 ? Math.round((this.currentPosition / this.duration) * 100) : 0;
            var endsAt = this.calculateEndsAt(this.duration - this.currentPosition);

            // Build overlay HTML
            overlay.innerHTML =
                '<div class="pause-backdrop" style="background-image: url(\'' + backdropUrl + '\')"></div>' +
                '<div class="pause-gradient"></div>' +
                '<div class="pause-header">' +
                    '<button class="pause-back-btn focusable" id="pause-back-btn">' +
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>' +
                    '</button>' +
                    '<button class="pause-close-btn focusable" id="pause-close-btn">&times;</button>' +
                '</div>' +
                '<div class="pause-content">' +
                    '<div class="pause-info">' +
                        titleHtml +
                        metaHtml +
                        overviewHtml +
                    '</div>' +
                '</div>' +
                '<div class="pause-progress-bar">' +
                    '<div class="pause-progress-track">' +
                        '<div class="pause-progress-fill" style="width: ' + percentWatched + '%"></div>' +
                    '</div>' +
                    '<div class="pause-progress-info">' +
                        '<span class="pause-time">' + currentTime + ' / ' + totalTime + '</span>' +
                        '<span class="pause-percent">' + percentWatched + '% watched</span>' +
                        '<span class="pause-ends">' + endsAt + '</span>' +
                    '</div>' +
                '</div>';

            // Show overlay with animation
            requestAnimationFrame(function() {
                overlay.classList.add('visible');
            });

            this.pauseOverlayVisible = true;

            // Bind events
            document.getElementById('pause-back-btn').addEventListener('click', function() {
                self.stop();
            });

            document.getElementById('pause-close-btn').addEventListener('click', function() {
                self.play();
            });

            // Focus close button (so Enter resumes playback, not goes back)
            setTimeout(function() {
                var closeBtn = document.getElementById('pause-close-btn');
                if (closeBtn && window.FocusManager) {
                    window.FocusManager.setFocus(closeBtn);
                }
            }, 100);
        },

        /**
         * Hide pause overlay
         */
        hidePauseOverlay: function() {
            var overlay = document.getElementById('pause-overlay');
            if (overlay) {
                overlay.classList.remove('visible');
                setTimeout(function() {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 300);
            }
            this.pauseOverlayVisible = false;
        },

        /**
         * Get backdrop image URL for media item
         */
        getBackdropUrl: function(item) {
            var serverUrl = window.StateManager.jellyfin.serverUrl;

            // Try backdrop first
            if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
                return serverUrl + '/Items/' + item.Id + '/Images/Backdrop?maxWidth=1920&quality=90';
            }

            // Try series backdrop for episodes
            if (item.Type === 'Episode' && item.SeriesId && item.ParentBackdropImageTags && item.ParentBackdropImageTags.length > 0) {
                return serverUrl + '/Items/' + item.SeriesId + '/Images/Backdrop?maxWidth=1920&quality=90';
            }

            // Fallback to primary image
            if (item.ImageTags && item.ImageTags.Primary) {
                return serverUrl + '/Items/' + item.Id + '/Images/Primary?maxWidth=1920&quality=90';
            }

            return '';
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
            return mins + 'm';
        },

        /**
         * Toggle favorite status
         */
        toggleFavorite: function() {
            var self = this;
            if (!this.mediaItem) return;

            var itemId = this.mediaItem.Id;
            var isFavorite = this.mediaItem.UserData && this.mediaItem.UserData.IsFavorite;

            // Toggle favorite via API
            var method = isFavorite ? 'DELETE' : 'POST';
            var state = window.StateManager;
            var url = state.jellyfin.serverUrl + '/Users/' + state.jellyfin.userId + '/FavoriteItems/' + itemId;

            fetch(url, {
                method: method,
                headers: {
                    'X-Emby-Authorization': 'MediaBrowser Client="JellyStream", Device="Samsung TV", DeviceId="' + state.jellyfin.deviceId + '", Version="1.0.0", Token="' + state.jellyfin.accessToken + '"'
                }
            })
            .then(function(response) {
                if (response.ok) {
                    // Update local state
                    if (!self.mediaItem.UserData) {
                        self.mediaItem.UserData = {};
                    }
                    self.mediaItem.UserData.IsFavorite = !isFavorite;
                    self.updateFavoriteButton();
                    console.log('PlayerScreen: Favorite toggled to', !isFavorite);
                }
            })
            .catch(function(error) {
                console.error('PlayerScreen: Failed to toggle favorite', error);
            });
        },

        /**
         * Toggle mute
         */
        toggleMute: function() {
            if (!this.videoElement) return;

            this.videoElement.muted = !this.videoElement.muted;
            this.updateVolumeUI();
        },

        /**
         * Set volume level
         */
        setVolume: function(level) {
            if (!this.videoElement) return;

            this.videoElement.volume = Math.max(0, Math.min(1, level));
            if (level > 0) {
                this.videoElement.muted = false;
            }
            this.updateVolumeUI();
        },

        /**
         * Update volume UI
         */
        updateVolumeUI: function() {
            var volumeBtn = document.getElementById('volume-btn');
            var volumeSlider = document.getElementById('volume-slider');

            if (volumeBtn) {
                var volumeOn = volumeBtn.querySelector('.volume-on');
                var volumeMuted = volumeBtn.querySelector('.volume-muted');

                if (this.videoElement.muted || this.videoElement.volume === 0) {
                    if (volumeOn) volumeOn.style.display = 'none';
                    if (volumeMuted) volumeMuted.style.display = 'block';
                } else {
                    if (volumeOn) volumeOn.style.display = 'block';
                    if (volumeMuted) volumeMuted.style.display = 'none';
                }
            }

            if (volumeSlider) {
                volumeSlider.value = this.videoElement.muted ? 0 : this.videoElement.volume * 100;
            }
        },

        /**
         * Toggle settings menu
         */
        toggleSettingsMenu: function() {
            var menu = document.getElementById('player-settings-menu');
            if (!menu) return;

            // Close tracks menu if open
            if (this.tracksMenuVisible) {
                this.hideTracksMenu();
            }

            if (menu.classList.contains('visible')) {
                this.hideSettingsMenu();
            } else {
                this.showSettingsMenu();
            }
        },

        /**
         * Show settings menu
         */
        showSettingsMenu: function() {
            var self = this;
            var menu = document.getElementById('player-settings-menu');
            if (!menu) return;

            this.settingsMenuVisible = true;

            // Reset pause overlay timer while in settings
            this.resetPauseOverlayTimer();

            // Update current values in menu
            this.updateSettingsMenuValues();

            menu.classList.remove('hidden');
            menu.classList.add('visible');

            // Bind click handlers to menu items
            var items = menu.querySelectorAll('.settings-menu-item');
            items.forEach(function(item) {
                item.onclick = function() {
                    var setting = item.dataset.setting;
                    self.handleSettingClick(setting);
                };
            });

            // Focus first item
            var firstItem = menu.querySelector('.settings-menu-item');
            if (firstItem && window.FocusManager) {
                window.FocusManager.setFocus(firstItem);
            }
        },

        /**
         * Hide settings menu
         */
        hideSettingsMenu: function() {
            var menu = document.getElementById('player-settings-menu');
            if (menu) {
                menu.classList.remove('visible');
                menu.classList.add('hidden');
            }
            this.settingsMenuVisible = false;

            // Reset pause overlay timer if still paused (15s of inactivity after closing menu)
            if (this.isPaused) {
                this.resetPauseOverlayTimer();
            }
        },

        /**
         * Update settings menu display values
         */
        updateSettingsMenuValues: function() {
            var aspectValue = document.getElementById('aspect-value');
            var speedValue = document.getElementById('speed-value');
            var qualityValue = document.getElementById('quality-value');
            var repeatValue = document.getElementById('repeat-value');

            if (aspectValue) {
                aspectValue.textContent = this.aspectRatio === 'auto' ? 'Auto' :
                    this.aspectRatio === 'fill' ? 'Fill' :
                    this.aspectRatio === '16:9' ? '16:9' :
                    this.aspectRatio === '4:3' ? '4:3' : 'Auto';
            }

            if (speedValue) {
                speedValue.textContent = this.playbackSpeed === 1 ? '1x' : this.playbackSpeed + 'x';
            }

            if (qualityValue) {
                var currentOption = this.qualityOptions.find(function(opt) {
                    return opt.value === this.currentQuality;
                }.bind(this));
                qualityValue.textContent = currentOption ? currentOption.label : 'Auto';
            }

            if (repeatValue) {
                repeatValue.textContent = this.repeatMode === 'none' ? 'Off' :
                    this.repeatMode === 'one' ? 'One' : 'All';
            }
        },

        /**
         * Handle settings menu item click
         */
        handleSettingClick: function(setting) {
            switch (setting) {
                case 'aspect':
                    this.cycleAspectRatio();
                    break;
                case 'speed':
                    this.cyclePlaybackSpeed();
                    break;
                case 'quality':
                    this.cycleQuality();
                    break;
                case 'repeat':
                    this.cycleRepeatMode();
                    break;
                case 'info':
                    this.showPlaybackInfo();
                    this.hideSettingsMenu();
                    break;
            }
            this.updateSettingsMenuValues();
        },

        /**
         * Cycle through quality options
         */
        cycleQuality: function() {
            var currentIndex = -1;
            for (var i = 0; i < this.qualityOptions.length; i++) {
                if (this.qualityOptions[i].value === this.currentQuality) {
                    currentIndex = i;
                    break;
                }
            }
            var nextIndex = (currentIndex + 1) % this.qualityOptions.length;
            var newQuality = this.qualityOptions[nextIndex];

            this.currentQuality = newQuality.value;
            console.log('PlayerScreen: Quality set to', newQuality.label, newQuality.value);

            // Reload stream with new quality
            this.reloadStreamWithQuality();
        },

        /**
         * Reload stream with current quality setting
         */
        reloadStreamWithQuality: function() {
            var self = this;
            var mediaId = window.StateManager.playback.currentMediaId;

            if (!mediaId || !this.mediaInfo) {
                console.error('PlayerScreen: Cannot reload stream - no media info');
                return;
            }

            // Save current position
            var currentTime = this.videoElement.currentTime;

            // Build new stream URL with bitrate
            var streamUrl = this.getStreamUrl(mediaId, this.mediaInfo);

            console.log('PlayerScreen: Reloading stream at position', currentTime, 'with URL', streamUrl);

            // Pause and update source
            this.videoElement.pause();
            this.videoElement.src = streamUrl;

            // Resume from saved position when ready
            this.videoElement.addEventListener('loadedmetadata', function onLoaded() {
                self.videoElement.removeEventListener('loadedmetadata', onLoaded);
                self.videoElement.currentTime = currentTime;
                self.play();
                console.log('PlayerScreen: Stream reloaded, resuming at', currentTime);
            });

            this.videoElement.load();
        },

        /**
         * Cycle through aspect ratios
         */
        cycleAspectRatio: function() {
            var ratios = ['auto', 'fill', '16:9', '4:3'];
            var currentIndex = ratios.indexOf(this.aspectRatio);
            this.aspectRatio = ratios[(currentIndex + 1) % ratios.length];

            if (this.videoElement) {
                switch (this.aspectRatio) {
                    case 'auto':
                        this.videoElement.style.objectFit = 'contain';
                        break;
                    case 'fill':
                        this.videoElement.style.objectFit = 'cover';
                        break;
                    case '16:9':
                        this.videoElement.style.objectFit = 'contain';
                        this.videoElement.style.aspectRatio = '16/9';
                        break;
                    case '4:3':
                        this.videoElement.style.objectFit = 'contain';
                        this.videoElement.style.aspectRatio = '4/3';
                        break;
                }
            }
            console.log('PlayerScreen: Aspect ratio set to', this.aspectRatio);
        },

        /**
         * Cycle through playback speeds
         */
        cyclePlaybackSpeed: function() {
            var speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
            var currentIndex = speeds.indexOf(this.playbackSpeed);
            if (currentIndex === -1) currentIndex = 2; // Default to 1.0
            this.playbackSpeed = speeds[(currentIndex + 1) % speeds.length];

            if (this.videoElement) {
                this.videoElement.playbackRate = this.playbackSpeed;
            }
            console.log('PlayerScreen: Playback speed set to', this.playbackSpeed);
        },

        /**
         * Cycle through repeat modes
         */
        cycleRepeatMode: function() {
            var modes = ['none', 'one', 'all'];
            var currentIndex = modes.indexOf(this.repeatMode);
            this.repeatMode = modes[(currentIndex + 1) % modes.length];

            if (this.videoElement) {
                this.videoElement.loop = (this.repeatMode === 'one');
            }
            console.log('PlayerScreen: Repeat mode set to', this.repeatMode);
        },

        /**
         * Show playback info overlay
         */
        showPlaybackInfo: function() {
            var info = {
                resolution: this.mediaInfo ? (this.mediaInfo.Width + 'x' + this.mediaInfo.Height) : 'Unknown',
                codec: this.mediaInfo ? this.mediaInfo.VideoCodec : 'Unknown',
                bitrate: this.mediaInfo ? Math.round(this.mediaInfo.Bitrate / 1000000) + ' Mbps' : 'Unknown',
                container: this.mediaInfo ? this.mediaInfo.Container : 'Unknown',
                audioCodec: this.mediaInfo && this.mediaInfo.MediaStreams ?
                    this.mediaInfo.MediaStreams.find(function(s) { return s.Type === 'Audio'; })?.Codec : 'Unknown'
            };

            var infoHtml = '<div class="playback-info-overlay" id="playback-info-overlay">' +
                '<div class="playback-info-content">' +
                '<h3>Playback Info</h3>' +
                '<p><strong>Resolution:</strong> ' + info.resolution + '</p>' +
                '<p><strong>Video Codec:</strong> ' + info.codec + '</p>' +
                '<p><strong>Audio Codec:</strong> ' + info.audioCodec + '</p>' +
                '<p><strong>Bitrate:</strong> ' + info.bitrate + '</p>' +
                '<p><strong>Container:</strong> ' + info.container + '</p>' +
                '<p><strong>Speed:</strong> ' + this.playbackSpeed + 'x</p>' +
                '</div></div>';

            var existing = document.getElementById('playback-info-overlay');
            if (existing) existing.remove();

            var overlay = document.createElement('div');
            overlay.innerHTML = infoHtml;
            document.getElementById('player-screen').appendChild(overlay.firstChild);

            // Auto-hide after 5 seconds
            setTimeout(function() {
                var el = document.getElementById('playback-info-overlay');
                if (el) el.remove();
            }, 5000);
        },

        /**
         * Toggle fullscreen (for completeness, TVs are usually already fullscreen)
         */
        toggleFullscreen: function() {
            if (!document.fullscreenElement) {
                var playerScreen = document.getElementById('player-screen');
                if (playerScreen && playerScreen.requestFullscreen) {
                    playerScreen.requestFullscreen().catch(function(err) {
                        console.log('PlayerScreen: Fullscreen request failed', err);
                    });
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        },

        /**
         * Calculate "Ends at" time
         */
        calculateEndsAt: function(remainingSeconds) {
            var now = new Date();
            var endTime = new Date(now.getTime() + (remainingSeconds * 1000));

            var hours = endTime.getHours();
            var minutes = endTime.getMinutes();
            var ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // Convert 0 to 12
            var minutesStr = minutes < 10 ? '0' + minutes : minutes;

            return 'Ends at ' + hours + ':' + minutesStr + ' ' + ampm;
        }
    };

    // Export to global scope
    window.PlayerScreen = PlayerScreen;

})(window, document);
