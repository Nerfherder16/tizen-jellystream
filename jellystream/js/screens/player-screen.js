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
        controlsVisible: true,
        controlsTimeout: null,
        CONTROLS_HIDE_DELAY: 5000,

        // Track selection
        audioTracks: [],
        subtitleTracks: [],
        currentAudioIndex: 0,
        currentSubtitleIndex: -1, // -1 means no subtitles
        tracksMenuVisible: false,

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

            // First get the item details for the title
            window.JellyfinClient.getItem(mediaId)
                .then(function(item) {
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

            // Pause video while menu is open
            this.pause();

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

            // Request VTT format subtitle
            var subtitleUrl = serverUrl + '/Videos/' + mediaId + '/' + this.mediaInfo.Id + '/Subtitles/' + subTrack.index + '/Stream.vtt';
            subtitleUrl += '?api_key=' + accessToken;

            var track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = subTrack.displayTitle;
            track.srclang = subTrack.language || 'en';
            track.src = subtitleUrl;
            track.default = true;

            video.appendChild(track);

            // Enable the track
            setTimeout(function() {
                if (video.textTracks && video.textTracks.length > 0) {
                    video.textTracks[0].mode = 'showing';
                    console.log('PlayerScreen: Subtitle track enabled');
                }
            }, 100);
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

            // Always try direct stream first - most modern browsers can handle it
            // The container check helps determine the best approach
            var container = mediaSource.Container || 'mp4';

            // Direct stream URL (works for most formats on Tizen/browsers)
            return baseUrl + '/Videos/' + mediaId + '/stream' +
                '?static=true' +
                '&mediaSourceId=' + mediaSource.Id +
                '&api_key=' + accessToken;
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
            });

            video.addEventListener('pause', function() {
                console.log('PlayerScreen: Paused');
                self.isPaused = true;
                self.updatePlayPauseButton();
                self.reportProgress();
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
                console.error('PlayerScreen: Video error', e);
                self.showError('Video playback error');
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
         * Update play/pause button state
         */
        updatePlayPauseButton: function() {
            var btn = document.getElementById('play-pause-btn');
            if (btn) {
                btn.textContent = this.isPaused ? '▶' : '⏸';
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
            if (progressBar && this.duration > 0) {
                var percent = (this.currentPosition / this.duration) * 100;
                progressBar.style.width = percent + '%';
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
        }
    };

    // Export to global scope
    window.PlayerScreen = PlayerScreen;

})(window, document);
