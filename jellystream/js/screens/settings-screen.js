/**
 * JellyStream - Settings Screen
 * App settings, account info, and configuration
 */
(function(window, document) {
    'use strict';

    var SettingsScreen = {
        initialized: false,

        /**
         * Initialize settings screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('SettingsScreen: Initializing');

            this.bindEvents();
            this.initialized = true;

            console.log('SettingsScreen: Initialized');
        },

        /**
         * Load settings screen
         */
        load: function() {
            console.log('SettingsScreen: Loading');

            this.renderAccountInfo();
            this.renderServerInfo();
            this.renderPlaybackInfo();
            this.renderSubtitlesInfo();
            this.renderDisplayInfo();
            this.renderPluginsInfo();
            this.renderJellyseerrInfo();
            this.renderAppInfo();

            // Focus first setting item
            setTimeout(function() {
                var firstItem = document.querySelector('#settings-screen .settings-item.focusable');
                if (firstItem && window.FocusManager) {
                    window.FocusManager.setFocus(firstItem);
                }
            }, 100);
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            var self = this;

            // Logout button
            var logoutBtn = document.getElementById('settings-logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', function() {
                    self.handleLogout();
                });
            }

            // Clear cache button
            var clearCacheBtn = document.getElementById('settings-clear-cache-btn');
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', function() {
                    self.handleClearCache();
                });
            }

            // Switch server button
            var switchServerBtn = document.getElementById('settings-switch-server-btn');
            if (switchServerBtn) {
                switchServerBtn.addEventListener('click', function() {
                    self.handleSwitchServer();
                });
            }

            // Jellyseerr config button
            var jellyseerrBtn = document.getElementById('settings-jellyseerr-btn');
            if (jellyseerrBtn) {
                jellyseerrBtn.addEventListener('click', function() {
                    self.showJellyseerrConfig();
                });
            }

            // Playback settings button
            var playbackBtn = document.getElementById('settings-playback-btn');
            if (playbackBtn) {
                playbackBtn.addEventListener('click', function() {
                    self.showPlaybackSettings();
                });
            }

            // Subtitles settings button
            var subtitlesBtn = document.getElementById('settings-subtitles-btn');
            if (subtitlesBtn) {
                subtitlesBtn.addEventListener('click', function() {
                    self.showSubtitleSettings();
                });
            }

            // Display settings button
            var displayBtn = document.getElementById('settings-display-btn');
            if (displayBtn) {
                displayBtn.addEventListener('click', function() {
                    self.showDisplaySettings();
                });
            }

            // Plugins button
            var pluginsBtn = document.getElementById('settings-plugins-btn');
            if (pluginsBtn) {
                pluginsBtn.addEventListener('click', function() {
                    self.showPluginsModal();
                });
            }
        },

        /**
         * Render account information
         */
        renderAccountInfo: function() {
            var container = document.getElementById('settings-account-info');
            if (!container) return;

            var state = window.StateManager;
            var userName = state.jellyfin.userName || 'Unknown User';
            var userId = state.jellyfin.userId || 'N/A';

            container.innerHTML =
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Username</span>' +
                    '<span class="settings-value">' + this.escapeHtml(userName) + '</span>' +
                '</div>' +
                '<div class="settings-info-row">' +
                    '<span class="settings-label">User ID</span>' +
                    '<span class="settings-value settings-value-mono">' + this.escapeHtml(userId.substring(0, 8)) + '...</span>' +
                '</div>';
        },

        /**
         * Render server information
         */
        renderServerInfo: function() {
            var container = document.getElementById('settings-server-info');
            if (!container) return;

            var state = window.StateManager;
            var serverUrl = state.jellyfin.serverUrl || 'Not connected';
            var serverName = state.jellyfin.serverName || 'Unknown Server';

            // Parse URL to show cleaner version
            var displayUrl = serverUrl;
            try {
                var url = new URL(serverUrl);
                displayUrl = url.hostname;
            } catch (e) {
                // Use as-is if parsing fails
            }

            container.innerHTML =
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Server</span>' +
                    '<span class="settings-value">' + this.escapeHtml(serverName) + '</span>' +
                '</div>' +
                '<div class="settings-info-row">' +
                    '<span class="settings-label">URL</span>' +
                    '<span class="settings-value">' + this.escapeHtml(displayUrl) + '</span>' +
                '</div>' +
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Status</span>' +
                    '<span class="settings-value settings-status-connected">Connected</span>' +
                '</div>';
        },

        /**
         * Render playback settings info
         */
        renderPlaybackInfo: function() {
            var self = this;
            var container = document.getElementById('settings-playback-info');
            if (!container) return;

            container.innerHTML = '<div class="settings-info-row"><span class="settings-label">Loading...</span></div>';

            window.JellyfinClient.getPlaybackSettings()
                .then(function(settings) {
                    var subtitleMode = settings.subtitleMode || 'Default';
                    var autoPlay = settings.enableNextEpisodeAutoPlay ? 'On' : 'Off';
                    var audioLang = settings.audioLanguagePreference || 'Auto';

                    // Audio channels display
                    var audioChannels = 'Auto';
                    if (settings.maxAudioChannels === 2) audioChannels = 'Stereo';
                    else if (settings.maxAudioChannels === 6) audioChannels = '5.1';
                    else if (settings.maxAudioChannels === 8) audioChannels = '7.1';

                    container.innerHTML =
                        '<div class="settings-info-row">' +
                            '<span class="settings-label">Audio</span>' +
                            '<span class="settings-value">' + self.escapeHtml(audioLang) + ' (' + audioChannels + ')</span>' +
                        '</div>' +
                        '<div class="settings-info-row">' +
                            '<span class="settings-label">Auto-play Next</span>' +
                            '<span class="settings-value">' + autoPlay + '</span>' +
                        '</div>';
                })
                .catch(function(error) {
                    console.error('Failed to load playback settings:', error);
                    container.innerHTML = '<div class="settings-info-row"><span class="settings-label">Click to configure</span></div>';
                });
        },

        /**
         * Render subtitles settings info
         */
        renderSubtitlesInfo: function() {
            var self = this;
            var container = document.getElementById('settings-subtitles-info');
            if (!container) return;

            container.innerHTML = '<div class="settings-info-row"><span class="settings-label">Loading...</span></div>';

            window.JellyfinClient.getSubtitleSettings()
                .then(function(settings) {
                    var subtitleMode = settings.subtitleMode || 'Default';
                    var subtitleLang = settings.subtitleLanguagePreference || 'Auto';

                    container.innerHTML =
                        '<div class="settings-info-row">' +
                            '<span class="settings-label">Language</span>' +
                            '<span class="settings-value">' + self.escapeHtml(subtitleLang) + '</span>' +
                        '</div>' +
                        '<div class="settings-info-row">' +
                            '<span class="settings-label">Mode</span>' +
                            '<span class="settings-value">' + self.escapeHtml(subtitleMode) + '</span>' +
                        '</div>';
                })
                .catch(function(error) {
                    console.error('Failed to load subtitle settings:', error);
                    container.innerHTML = '<div class="settings-info-row"><span class="settings-label">Click to configure</span></div>';
                });
        },

        /**
         * Render display settings info
         */
        renderDisplayInfo: function() {
            var self = this;
            var container = document.getElementById('settings-display-info');
            if (!container) return;

            // Get local display settings
            var theme = localStorage.getItem('jellystream_theme') || 'Dark';
            var displayMode = localStorage.getItem('jellystream_display_mode') || 'Auto';

            container.innerHTML =
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Theme</span>' +
                    '<span class="settings-value">' + self.escapeHtml(theme) + '</span>' +
                '</div>' +
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Display Mode</span>' +
                    '<span class="settings-value">' + self.escapeHtml(displayMode) + '</span>' +
                '</div>';
        },

        /**
         * Render plugins info
         */
        renderPluginsInfo: function() {
            var self = this;
            var container = document.getElementById('settings-plugins-info');
            if (!container) return;

            container.innerHTML = '<div class="settings-info-row"><span class="settings-label">Loading...</span></div>';

            window.JellyfinClient.getPlugins()
                .then(function(plugins) {
                    if (!plugins || !Array.isArray(plugins)) {
                        throw new Error('Invalid response');
                    }
                    var enabledCount = plugins.filter(function(p) { return p.Status === 'Active'; }).length;
                    var totalCount = plugins.length;

                    container.innerHTML =
                        '<div class="settings-info-row">' +
                            '<span class="settings-label">Installed</span>' +
                            '<span class="settings-value">' + totalCount + ' plugins</span>' +
                        '</div>' +
                        '<div class="settings-info-row">' +
                            '<span class="settings-label">Active</span>' +
                            '<span class="settings-value">' + enabledCount + ' enabled</span>' +
                        '</div>';
                })
                .catch(function(error) {
                    console.error('Failed to load plugins:', error);
                    // Admin-only endpoint - show friendly message
                    container.innerHTML =
                        '<div class="settings-info-row">' +
                            '<span class="settings-label">Status</span>' +
                            '<span class="settings-value">Requires admin access</span>' +
                        '</div>';
                });
        },

        /**
         * Show playback settings modal
         */
        showPlaybackSettings: function() {
            var self = this;

            var overlay = document.createElement('div');
            overlay.id = 'playback-settings-modal';
            overlay.className = 'settings-modal-overlay';

            overlay.innerHTML =
                '<div class="settings-modal settings-modal-large">' +
                    '<h2>Playback Settings</h2>' +
                    '<div id="playback-settings-content" class="settings-modal-content settings-modal-scrollable">' +
                        '<div class="spinner"></div><p>Loading settings...</p>' +
                    '</div>' +
                    '<div class="settings-modal-buttons">' +
                        '<button id="playback-close-btn" class="btn btn-secondary focusable">Close</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            // Load settings
            window.JellyfinClient.getPlaybackSettings()
                .then(function(settings) {
                    var content = document.getElementById('playback-settings-content');

                    // Load local preferences
                    var introAction = localStorage.getItem('jellystream_intro_action') || 'AskToSkip';
                    var outroAction = localStorage.getItem('jellystream_outro_action') || 'AskToSkip';
                    var previewAction = localStorage.getItem('jellystream_preview_action') || 'None';
                    var recapAction = localStorage.getItem('jellystream_recap_action') || 'None';
                    var commercialAction = localStorage.getItem('jellystream_commercial_action') || 'AutoSkip';

                    content.innerHTML =
                        // AUDIO SETTINGS
                        '<div class="settings-section-header">Audio Settings</div>' +
                        '<div class="form-group">' +
                            '<label>Maximum Allowed Audio Channels</label>' +
                            '<p class="form-descriptor">Limit the number of audio channels to prevent transcoding on systems that don\'t support surround sound.</p>' +
                            '<select id="max-audio-channels" class="focusable">' +
                                '<option value="-1"' + (settings.maxAudioChannels === -1 ? ' selected' : '') + '>Auto</option>' +
                                '<option value="2"' + (settings.maxAudioChannels === 2 ? ' selected' : '') + '>Stereo</option>' +
                                '<option value="6"' + (settings.maxAudioChannels === 6 ? ' selected' : '') + '>5.1 Surround</option>' +
                                '<option value="8"' + (settings.maxAudioChannels === 8 ? ' selected' : '') + '>7.1 Surround</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Preferred Audio Language</label>' +
                            '<p class="form-descriptor">The preferred audio language when multiple options are available.</p>' +
                            '<input type="text" id="audio-lang-input" class="focusable" placeholder="e.g., English" value="' + self.escapeHtml(settings.audioLanguagePreference || '') + '" />' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="default-audio-checkbox" class="focusable"' + (settings.playDefaultAudioTrack ? ' checked' : '') + ' />' +
                                ' Play default audio track regardless of language' +
                            '</label>' +
                            '<p class="form-descriptor">When enabled, the default audio track will be used instead of matching by language preference.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="disable-vbr-checkbox" class="focusable"' + (settings.enableAudioVbr === false ? ' checked' : '') + ' />' +
                                ' Disable VBR audio encoding' +
                            '</label>' +
                            '<p class="form-descriptor">VBR (Variable Bit Rate) audio is more efficient but some devices may not support it properly.</p>' +
                        '</div>' +

                        // VIDEO QUALITY
                        '<div class="settings-section-header">Video Quality</div>' +
                        '<div class="form-group">' +
                            '<label>Internet Streaming Quality</label>' +
                            '<p class="form-descriptor">Maximum bitrate for streaming over the internet. Lower values use less bandwidth.</p>' +
                            '<select id="internet-quality" class="focusable">' +
                                '<option value="auto"' + (!settings.maxStreamingBitrate ? ' selected' : '') + '>Auto</option>' +
                                '<option value="120000000"' + (settings.maxStreamingBitrate === 120000000 ? ' selected' : '') + '>120 Mbps (4K)</option>' +
                                '<option value="80000000"' + (settings.maxStreamingBitrate === 80000000 ? ' selected' : '') + '>80 Mbps (4K)</option>' +
                                '<option value="60000000"' + (settings.maxStreamingBitrate === 60000000 ? ' selected' : '') + '>60 Mbps (4K)</option>' +
                                '<option value="40000000"' + (settings.maxStreamingBitrate === 40000000 ? ' selected' : '') + '>40 Mbps (1080p)</option>' +
                                '<option value="20000000"' + (settings.maxStreamingBitrate === 20000000 ? ' selected' : '') + '>20 Mbps (1080p)</option>' +
                                '<option value="15000000"' + (settings.maxStreamingBitrate === 15000000 ? ' selected' : '') + '>15 Mbps (1080p)</option>' +
                                '<option value="10000000"' + (settings.maxStreamingBitrate === 10000000 ? ' selected' : '') + '>10 Mbps (720p)</option>' +
                                '<option value="8000000"' + (settings.maxStreamingBitrate === 8000000 ? ' selected' : '') + '>8 Mbps (720p)</option>' +
                                '<option value="4000000"' + (settings.maxStreamingBitrate === 4000000 ? ' selected' : '') + '>4 Mbps (480p)</option>' +
                                '<option value="2000000"' + (settings.maxStreamingBitrate === 2000000 ? ' selected' : '') + '>2 Mbps (360p)</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Maximum Allowed Video Transcoding Resolution</label>' +
                            '<p class="form-descriptor">Limit the maximum resolution for transcoded content to reduce server load.</p>' +
                            '<select id="max-video-res" class="focusable">' +
                                '<option value="">Auto</option>' +
                                '<option value="480">480p</option>' +
                                '<option value="720">720p</option>' +
                                '<option value="1080">1080p</option>' +
                                '<option value="2160">4K</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="limit-supported-res-checkbox" class="focusable"' + (settings.limitSupportedVideoResolution ? ' checked' : '') + ' />' +
                                ' Limit maximum supported video resolution' +
                            '</label>' +
                            '<p class="form-descriptor">Use \'Maximum Allowed Video Transcoding Resolution\' as maximum supported video resolution.</p>' +
                        '</div>' +

                        // MUSIC QUALITY
                        '<div class="settings-section-header">Music Quality</div>' +
                        '<div class="form-group">' +
                            '<label>Internet Streaming Quality</label>' +
                            '<p class="form-descriptor">Maximum bitrate for music streaming over the internet.</p>' +
                            '<select id="music-internet-quality" class="focusable">' +
                                '<option value="auto">Auto</option>' +
                                '<option value="320000">320 kbps</option>' +
                                '<option value="256000">256 kbps</option>' +
                                '<option value="192000">192 kbps</option>' +
                                '<option value="128000">128 kbps</option>' +
                                '<option value="96000">96 kbps</option>' +
                                '<option value="64000">64 kbps</option>' +
                            '</select>' +
                        '</div>' +

                        // ADVANCED
                        '<div class="settings-section-header">Advanced</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="prefer-fmp4-hls-checkbox" class="focusable"' + (settings.preferFmp4Hls ? ' checked' : '') + ' />' +
                                ' Prefer fMP4-HLS Media Container' +
                            '</label>' +
                            '<p class="form-descriptor">Prefer to use fMP4 as the default container for HLS, making it possible to direct stream HEVC and AV1 content on supported devices.</p>' +
                        '</div>' +

                        // PLAYBACK BEHAVIOR
                        '<div class="settings-section-header">Playback Behavior</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="autoplay-checkbox" class="focusable"' + (settings.enableNextEpisodeAutoPlay ? ' checked' : '') + ' />' +
                                ' Auto-play next video' +
                            '</label>' +
                            '<p class="form-descriptor">Automatically play the next episode when the current one ends.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="cinema-mode-checkbox" class="focusable"' + (settings.enableCinemaMode ? ' checked' : '') + ' />' +
                                ' Cinema mode' +
                            '</label>' +
                            '<p class="form-descriptor">Play trailers and custom intros before the main feature.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="next-video-info-checkbox" class="focusable"' + (settings.showNextVideoInfo !== false ? ' checked' : '') + ' />' +
                                ' Show next video info during playback' +
                            '</label>' +
                            '<p class="form-descriptor">Display information about the next video near the end of playback.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="remember-audio-checkbox" class="focusable"' + (settings.rememberAudioSelections ? ' checked' : '') + ' />' +
                                ' Set audio track based on previous item' +
                            '</label>' +
                            '<p class="form-descriptor">Remember your audio track selection between episodes and movies.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="remember-subtitle-checkbox" class="focusable"' + (settings.rememberSubtitleSelections ? ' checked' : '') + ' />' +
                                ' Set subtitle track based on previous item' +
                            '</label>' +
                            '<p class="form-descriptor">Remember your subtitle selection between episodes and movies.</p>' +
                        '</div>' +

                        // SKIP CONTROLS
                        '<div class="settings-section-header">Skip Controls</div>' +
                        '<div class="form-group">' +
                            '<label>Skip Forward Length</label>' +
                            '<p class="form-descriptor">Amount of time to skip when pressing the forward button.</p>' +
                            '<select id="skip-forward" class="focusable">' +
                                '<option value="10000"' + (settings.skipForwardLength === 10000 ? ' selected' : '') + '>10 seconds</option>' +
                                '<option value="15000"' + (settings.skipForwardLength === 15000 ? ' selected' : '') + '>15 seconds</option>' +
                                '<option value="30000"' + (settings.skipForwardLength === 30000 || !settings.skipForwardLength ? ' selected' : '') + '>30 seconds</option>' +
                                '<option value="60000"' + (settings.skipForwardLength === 60000 ? ' selected' : '') + '>60 seconds</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Skip Back Length</label>' +
                            '<p class="form-descriptor">Amount of time to skip when pressing the back button.</p>' +
                            '<select id="skip-back" class="focusable">' +
                                '<option value="5000"' + (settings.skipBackLength === 5000 ? ' selected' : '') + '>5 seconds</option>' +
                                '<option value="10000"' + (settings.skipBackLength === 10000 || !settings.skipBackLength ? ' selected' : '') + '>10 seconds</option>' +
                                '<option value="15000"' + (settings.skipBackLength === 15000 ? ' selected' : '') + '>15 seconds</option>' +
                                '<option value="30000"' + (settings.skipBackLength === 30000 ? ' selected' : '') + '>30 seconds</option>' +
                            '</select>' +
                        '</div>' +

                        // MEDIA SEGMENTS
                        '<div class="settings-section-header">Media Segment Actions</div>' +
                        '<p class="form-descriptor section-desc">Configure how to handle detected media segments. Requires the Intro Skipper or similar plugin.</p>' +
                        '<div class="form-group">' +
                            '<label>Intro Segments</label>' +
                            '<select id="intro-action" class="focusable">' +
                                '<option value="None"' + (introAction === 'None' ? ' selected' : '') + '>None</option>' +
                                '<option value="AskToSkip"' + (introAction === 'AskToSkip' ? ' selected' : '') + '>Ask To Skip</option>' +
                                '<option value="AutoSkip"' + (introAction === 'AutoSkip' ? ' selected' : '') + '>Auto Skip</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Preview Segments</label>' +
                            '<select id="preview-action" class="focusable">' +
                                '<option value="None"' + (previewAction === 'None' ? ' selected' : '') + '>None</option>' +
                                '<option value="AskToSkip"' + (previewAction === 'AskToSkip' ? ' selected' : '') + '>Ask To Skip</option>' +
                                '<option value="AutoSkip"' + (previewAction === 'AutoSkip' ? ' selected' : '') + '>Auto Skip</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Recap Segments</label>' +
                            '<select id="recap-action" class="focusable">' +
                                '<option value="None"' + (recapAction === 'None' ? ' selected' : '') + '>None</option>' +
                                '<option value="AskToSkip"' + (recapAction === 'AskToSkip' ? ' selected' : '') + '>Ask To Skip</option>' +
                                '<option value="AutoSkip"' + (recapAction === 'AutoSkip' ? ' selected' : '') + '>Auto Skip</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Commercial Segments</label>' +
                            '<select id="commercial-action" class="focusable">' +
                                '<option value="None"' + (commercialAction === 'None' ? ' selected' : '') + '>None</option>' +
                                '<option value="AskToSkip"' + (commercialAction === 'AskToSkip' ? ' selected' : '') + '>Ask To Skip</option>' +
                                '<option value="AutoSkip"' + (commercialAction === 'AutoSkip' ? ' selected' : '') + '>Auto Skip</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Outro/Credits Segments</label>' +
                            '<select id="outro-action" class="focusable">' +
                                '<option value="None"' + (outroAction === 'None' ? ' selected' : '') + '>None</option>' +
                                '<option value="AskToSkip"' + (outroAction === 'AskToSkip' ? ' selected' : '') + '>Ask To Skip</option>' +
                                '<option value="AutoSkip"' + (outroAction === 'AutoSkip' ? ' selected' : '') + '>Auto Skip</option>' +
                            '</select>' +
                        '</div>' +

                        // VIDEO ADVANCED
                        '<div class="settings-section-header">Video Advanced</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="enable-dts-checkbox" class="focusable"' + (settings.enableDts ? ' checked' : '') + ' />' +
                                ' Enable DTS' +
                            '</label>' +
                            '<p class="form-descriptor">Allow DTS audio passthrough. Disable if your audio system doesn\'t support DTS.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="enable-truehd-checkbox" class="focusable"' + (settings.enableTrueHd ? ' checked' : '') + ' />' +
                                ' Enable TrueHD' +
                            '</label>' +
                            '<p class="form-descriptor">Allow Dolby TrueHD audio passthrough. Disable if your audio system doesn\'t support TrueHD.</p>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Preferred Transcode Video Codec</label>' +
                            '<p class="form-descriptor">The preferred video codec when transcoding is required. H264 has widest compatibility, HEVC/AV1 are more efficient.</p>' +
                            '<select id="preferred-video-codec" class="focusable">' +
                                '<option value="">Auto</option>' +
                                '<option value="h264"' + (settings.preferredVideoCodec === 'h264' ? ' selected' : '') + '>H264 (Most Compatible)</option>' +
                                '<option value="hevc"' + (settings.preferredVideoCodec === 'hevc' ? ' selected' : '') + '>HEVC/H265 (Efficient)</option>' +
                                '<option value="av1"' + (settings.preferredVideoCodec === 'av1' ? ' selected' : '') + '>AV1 (Most Efficient)</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Preferred Transcode Audio Codec</label>' +
                            '<p class="form-descriptor">The preferred audio codec when transcoding is required.</p>' +
                            '<select id="preferred-audio-codec" class="focusable">' +
                                '<option value="">Auto</option>' +
                                '<option value="aac"' + (settings.preferredAudioCodec === 'aac' ? ' selected' : '') + '>AAC (Most Compatible)</option>' +
                                '<option value="opus"' + (settings.preferredAudioCodec === 'opus' ? ' selected' : '') + '>Opus (Efficient)</option>' +
                                '<option value="ac3"' + (settings.preferredAudioCodec === 'ac3' ? ' selected' : '') + '>AC3/Dolby Digital</option>' +
                                '<option value="eac3"' + (settings.preferredAudioCodec === 'eac3' ? ' selected' : '') + '>E-AC3/Dolby Digital Plus</option>' +
                            '</select>' +
                        '</div>' +

                        // AUDIO ADVANCED
                        '<div class="settings-section-header">Audio Advanced</div>' +
                        '<div class="form-group">' +
                            '<label>Audio Normalization</label>' +
                            '<p class="form-descriptor">Track gain adjusts the volume of each track so they playback with the same loudness. Album gain adjusts the volume of all tracks in an album only, keeping the album\'s dynamic range. Switching between "Off" and other options requires restarting the current playback.</p>' +
                            '<select id="audio-normalization" class="focusable">' +
                                '<option value="None"' + (settings.audioNormalization === 'None' || !settings.audioNormalization ? ' selected' : '') + '>Off</option>' +
                                '<option value="TrackGain"' + (settings.audioNormalization === 'TrackGain' ? ' selected' : '') + '>Track Gain</option>' +
                                '<option value="AlbumGain"' + (settings.audioNormalization === 'AlbumGain' ? ' selected' : '') + '>Album Gain</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="remux-flac-checkbox" class="focusable"' + (settings.alwaysRemuxFlac ? ' checked' : '') + ' />' +
                                ' Always remux FLAC audio files' +
                            '</label>' +
                            '<p class="form-descriptor">If you have files that your browser rejects to play or where it inaccurately calculates timestamps, enable this as a workaround.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="remux-mp3-checkbox" class="focusable"' + (settings.alwaysRemuxMp3 ? ' checked' : '') + ' />' +
                                ' Always remux MP3 audio files' +
                            '</label>' +
                            '<p class="form-descriptor">If you have files that your browser inaccurately calculates timestamps, enable this as a workaround.</p>' +
                        '</div>' +

                        '<button id="playback-save-btn" class="btn btn-primary focusable" style="margin-top: 20px;">Save Changes</button>' +
                        '<div id="playback-save-status" class="settings-modal-status"></div>';

                    // Bind save button
                    document.getElementById('playback-save-btn').addEventListener('click', function() {
                        self.savePlaybackSettings();
                    });
                })
                .catch(function(error) {
                    var content = document.getElementById('playback-settings-content');
                    content.innerHTML = '<p class="error-message">Failed to load settings: ' + error.message + '</p>';
                });

            // Bind close button
            document.getElementById('playback-close-btn').addEventListener('click', function() {
                self.closePlaybackSettings();
            });

            overlay.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    self.closePlaybackSettings();
                }
            });
        },

        /**
         * Save playback settings
         */
        savePlaybackSettings: function() {
            var self = this;
            var statusEl = document.getElementById('playback-save-status');
            statusEl.innerHTML = '<span class="status-testing">Saving...</span>';

            // Get internet quality bitrate
            var internetQuality = document.getElementById('internet-quality').value;
            var maxStreamingBitrate = internetQuality === 'auto' ? null : parseInt(internetQuality);

            // Collect all settings to send to Jellyfin
            var settings = {
                // Audio
                maxAudioChannels: parseInt(document.getElementById('max-audio-channels').value),
                audioLanguagePreference: document.getElementById('audio-lang-input').value.trim(),
                playDefaultAudioTrack: document.getElementById('default-audio-checkbox').checked,
                enableAudioVbr: !document.getElementById('disable-vbr-checkbox').checked,

                // Video Quality
                maxStreamingBitrate: maxStreamingBitrate,
                limitSupportedVideoResolution: document.getElementById('limit-supported-res-checkbox').checked,

                // Advanced
                preferFmp4Hls: document.getElementById('prefer-fmp4-hls-checkbox').checked,

                // Playback behavior
                enableNextEpisodeAutoPlay: document.getElementById('autoplay-checkbox').checked,
                enableCinemaMode: document.getElementById('cinema-mode-checkbox').checked,
                rememberAudioSelections: document.getElementById('remember-audio-checkbox').checked,
                rememberSubtitleSelections: document.getElementById('remember-subtitle-checkbox').checked,

                // Advanced Video
                enableDts: document.getElementById('enable-dts-checkbox').checked,
                enableTrueHd: document.getElementById('enable-truehd-checkbox').checked,

                // Audio Advanced
                audioNormalization: document.getElementById('audio-normalization').value,
                alwaysRemuxFlac: document.getElementById('remux-flac-checkbox').checked,
                alwaysRemuxMp3: document.getElementById('remux-mp3-checkbox').checked
            };

            // Save skip controls locally (client-side settings)
            localStorage.setItem('jellystream_skip_forward', document.getElementById('skip-forward').value);
            localStorage.setItem('jellystream_skip_back', document.getElementById('skip-back').value);

            // Save media segment preferences locally
            localStorage.setItem('jellystream_intro_action', document.getElementById('intro-action').value);
            localStorage.setItem('jellystream_preview_action', document.getElementById('preview-action').value);
            localStorage.setItem('jellystream_recap_action', document.getElementById('recap-action').value);
            localStorage.setItem('jellystream_commercial_action', document.getElementById('commercial-action').value);
            localStorage.setItem('jellystream_outro_action', document.getElementById('outro-action').value);

            // Save next video info preference
            localStorage.setItem('jellystream_show_next_video_info', document.getElementById('next-video-info-checkbox').checked);

            // Save advanced codec preferences locally
            localStorage.setItem('jellystream_preferred_video_codec', document.getElementById('preferred-video-codec').value);
            localStorage.setItem('jellystream_preferred_audio_codec', document.getElementById('preferred-audio-codec').value);

            // Save music quality locally
            localStorage.setItem('jellystream_music_quality', document.getElementById('music-internet-quality').value);

            window.JellyfinClient.updatePlaybackSettings(settings)
                .then(function() {
                    statusEl.innerHTML = '<span class="status-success">Settings saved!</span>';
                    self.renderPlaybackInfo();
                    setTimeout(function() {
                        self.closePlaybackSettings();
                    }, 1000);
                })
                .catch(function(error) {
                    statusEl.innerHTML = '<span class="status-error">Failed to save: ' + error.message + '</span>';
                });
        },

        /**
         * Close playback settings modal
         */
        closePlaybackSettings: function() {
            var modal = document.getElementById('playback-settings-modal');
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        },

        /**
         * Show subtitle settings modal
         */
        showSubtitleSettings: function() {
            var self = this;

            var overlay = document.createElement('div');
            overlay.id = 'subtitle-settings-modal';
            overlay.className = 'settings-modal-overlay';

            overlay.innerHTML =
                '<div class="settings-modal settings-modal-large">' +
                    '<h2>Subtitle Settings</h2>' +
                    '<div id="subtitle-settings-content" class="settings-modal-content settings-modal-scrollable">' +
                        '<div class="spinner"></div><p>Loading settings...</p>' +
                    '</div>' +
                    '<div class="settings-modal-buttons">' +
                        '<button id="subtitle-close-btn" class="btn btn-secondary focusable">Close</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            // Load settings
            window.JellyfinClient.getSubtitleSettings()
                .then(function(settings) {
                    var content = document.getElementById('subtitle-settings-content');

                    content.innerHTML =
                        // SUBTITLE LANGUAGE & MODE
                        '<div class="settings-section-header">Subtitles</div>' +
                        '<div class="form-group">' +
                            '<label>Preferred Subtitle Language</label>' +
                            '<input type="text" id="subtitle-lang-input" class="focusable" placeholder="e.g., English" value="' + self.escapeHtml(settings.subtitleLanguagePreference || '') + '" />' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Subtitle Mode</label>' +
                            '<select id="subtitle-mode-select" class="focusable">' +
                                '<option value="Default"' + (settings.subtitleMode === 'Default' ? ' selected' : '') + '>Default</option>' +
                                '<option value="Always"' + (settings.subtitleMode === 'Always' ? ' selected' : '') + '>Always Play</option>' +
                                '<option value="OnlyForced"' + (settings.subtitleMode === 'OnlyForced' ? ' selected' : '') + '>Only Forced</option>' +
                                '<option value="None"' + (settings.subtitleMode === 'None' ? ' selected' : '') + '>None</option>' +
                                '<option value="Smart"' + (settings.subtitleMode === 'Smart' ? ' selected' : '') + '>Smart</option>' +
                            '</select>' +
                            '<p class="form-descriptor">Subtitles matching the language preference will be loaded regardless of the audio language.</p>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label>Burn Subtitles</label>' +
                            '<select id="burn-subtitles-select" class="focusable">' +
                                '<option value="Auto"' + (settings.burnSubtitles === 'Auto' ? ' selected' : '') + '>Auto</option>' +
                                '<option value="Always"' + (settings.burnSubtitles === 'Always' ? ' selected' : '') + '>Always</option>' +
                                '<option value="Never"' + (settings.burnSubtitles === 'Never' ? ' selected' : '') + '>Never</option>' +
                            '</select>' +
                            '<p class="form-descriptor">Determine if the server should burn in subtitles. Avoiding this will greatly improve performance. Select Auto to burn image based formats (VobSub, PGS, SUB, IDX, etc.) and certain ASS or SSA subtitles.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="pgs-rendering-checkbox" class="focusable"' + (settings.enablePgsRendering ? ' checked' : '') + ' />' +
                                ' Experimental PGS subtitle rendering' +
                            '</label>' +
                            '<p class="form-descriptor">Determine if the client should render PGS subtitles instead of using burned in subtitles. This can avoid server-side transcoding in exchange of client-side rendering performance.</p>' +
                        '</div>' +
                        '<div class="form-group form-checkbox">' +
                            '<label>' +
                                '<input type="checkbox" id="always-burn-transcode-checkbox" class="focusable"' + (settings.alwaysBurnOnTranscode ? ' checked' : '') + ' />' +
                                ' Always burn in subtitle when transcoding' +
                            '</label>' +
                            '<p class="form-descriptor">Burn in all subtitles when transcoding is triggered. This ensures subtitle synchronization after transcoding at the cost of reduced transcoding speed.</p>' +
                        '</div>' +

                        // SUBTITLE APPEARANCE
                        '<div class="settings-section-header">Subtitle Appearance</div>' +
                        '<p class="form-descriptor section-desc">These settings affect subtitles on this device. Following settings do not apply to graphical subtitles (PGS, VobSub) or ASS/SSA subtitles that embed their own styles.</p>' +

                        '<div class="form-group">' +
                            '<label>Subtitle Styling</label>' +
                            '<select id="subtitle-styling-select" class="focusable">' +
                                '<option value="Auto"' + (settings.subtitleStyling === 'Auto' ? ' selected' : '') + '>Auto</option>' +
                                '<option value="Native"' + (settings.subtitleStyling === 'Native' ? ' selected' : '') + '>Native</option>' +
                                '<option value="Custom"' + (settings.subtitleStyling === 'Custom' ? ' selected' : '') + '>Custom</option>' +
                            '</select>' +
                            '<p class="form-descriptor">This mode will automatically switch between the native and custom subtitle styling mechanisms based on your device type.</p>' +
                        '</div>' +

                        '<div class="form-group">' +
                            '<label>Text Size</label>' +
                            '<select id="text-size-select" class="focusable">' +
                                '<option value="Small"' + (settings.textSize === 'Small' ? ' selected' : '') + '>Small</option>' +
                                '<option value="Normal"' + (settings.textSize === 'Normal' ? ' selected' : '') + '>Normal</option>' +
                                '<option value="Large"' + (settings.textSize === 'Large' ? ' selected' : '') + '>Large</option>' +
                                '<option value="ExtraLarge"' + (settings.textSize === 'ExtraLarge' ? ' selected' : '') + '>Extra Large</option>' +
                            '</select>' +
                        '</div>' +

                        '<div class="form-group">' +
                            '<label>Text Weight</label>' +
                            '<select id="text-weight-select" class="focusable">' +
                                '<option value="Normal"' + (settings.textWeight === 'Normal' ? ' selected' : '') + '>Normal</option>' +
                                '<option value="Bold"' + (settings.textWeight === 'Bold' ? ' selected' : '') + '>Bold</option>' +
                            '</select>' +
                        '</div>' +

                        '<div class="form-group">' +
                            '<label>Font</label>' +
                            '<select id="font-select" class="focusable">' +
                                '<option value="Default"' + (settings.font === 'Default' ? ' selected' : '') + '>Default</option>' +
                                '<option value="Arial"' + (settings.font === 'Arial' ? ' selected' : '') + '>Arial</option>' +
                                '<option value="Helvetica"' + (settings.font === 'Helvetica' ? ' selected' : '') + '>Helvetica</option>' +
                                '<option value="Verdana"' + (settings.font === 'Verdana' ? ' selected' : '') + '>Verdana</option>' +
                                '<option value="TimesNewRoman"' + (settings.font === 'TimesNewRoman' ? ' selected' : '') + '>Times New Roman</option>' +
                                '<option value="Georgia"' + (settings.font === 'Georgia' ? ' selected' : '') + '>Georgia</option>' +
                                '<option value="CourierNew"' + (settings.font === 'CourierNew' ? ' selected' : '') + '>Courier New</option>' +
                            '</select>' +
                        '</div>' +

                        '<div class="form-group">' +
                            '<label>Text Color</label>' +
                            '<div class="color-input-wrapper">' +
                                '<input type="color" id="text-color-input" class="focusable color-picker" value="' + (settings.textColor || '#FFFFFF') + '" />' +
                                '<span id="text-color-value" class="color-value">' + (settings.textColor || '#FFFFFF') + '</span>' +
                            '</div>' +
                        '</div>' +

                        '<div class="form-group">' +
                            '<label>Drop Shadow</label>' +
                            '<select id="drop-shadow-select" class="focusable">' +
                                '<option value="None"' + (settings.dropShadow === 'None' ? ' selected' : '') + '>None</option>' +
                                '<option value="DropShadow"' + (settings.dropShadow === 'DropShadow' ? ' selected' : '') + '>Drop Shadow</option>' +
                                '<option value="Raised"' + (settings.dropShadow === 'Raised' ? ' selected' : '') + '>Raised</option>' +
                                '<option value="Depressed"' + (settings.dropShadow === 'Depressed' ? ' selected' : '') + '>Depressed</option>' +
                                '<option value="Uniform"' + (settings.dropShadow === 'Uniform' ? ' selected' : '') + '>Uniform</option>' +
                            '</select>' +
                        '</div>' +

                        '<div class="form-group">' +
                            '<label>Vertical Position</label>' +
                            '<input type="number" id="vertical-position-input" class="focusable" min="-10" max="10" value="' + (settings.verticalPosition || -2) + '" />' +
                            '<p class="form-descriptor">Line number where text appears. Positive numbers indicate top down. Negative numbers indicate bottom up.</p>' +
                        '</div>' +

                        // PREVIEW
                        '<div class="settings-section-header">Preview</div>' +
                        '<div class="subtitle-preview-container">' +
                            '<div id="subtitle-preview" class="subtitle-preview">' +
                                '<span>Sample Subtitle Text</span>' +
                            '</div>' +
                        '</div>' +

                        '<button id="subtitle-save-btn" class="btn btn-primary focusable" style="margin-top: 20px;">Save Changes</button>' +
                        '<div id="subtitle-save-status" class="settings-modal-status"></div>';

                    // Bind color input change
                    var colorInput = document.getElementById('text-color-input');
                    var colorValue = document.getElementById('text-color-value');
                    if (colorInput && colorValue) {
                        colorInput.addEventListener('input', function() {
                            colorValue.textContent = this.value.toUpperCase();
                            self.updateSubtitlePreview();
                        });
                    }

                    // Bind preview update for all settings
                    var previewInputs = ['text-size-select', 'text-weight-select', 'font-select', 'drop-shadow-select'];
                    previewInputs.forEach(function(id) {
                        var el = document.getElementById(id);
                        if (el) {
                            el.addEventListener('change', function() {
                                self.updateSubtitlePreview();
                            });
                        }
                    });

                    // Initial preview update
                    self.updateSubtitlePreview();

                    // Bind save button
                    document.getElementById('subtitle-save-btn').addEventListener('click', function() {
                        self.saveSubtitleSettings();
                    });
                })
                .catch(function(error) {
                    var content = document.getElementById('subtitle-settings-content');
                    content.innerHTML = '<p class="error-message">Failed to load settings: ' + error.message + '</p>';
                });

            // Bind close button
            document.getElementById('subtitle-close-btn').addEventListener('click', function() {
                self.closeSubtitleSettings();
            });

            overlay.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    self.closeSubtitleSettings();
                }
            });
        },

        /**
         * Update subtitle preview
         */
        updateSubtitlePreview: function() {
            var preview = document.getElementById('subtitle-preview');
            if (!preview) return;

            var textSize = document.getElementById('text-size-select').value;
            var textWeight = document.getElementById('text-weight-select').value;
            var font = document.getElementById('font-select').value;
            var textColor = document.getElementById('text-color-input').value;
            var dropShadow = document.getElementById('drop-shadow-select').value;

            // Size mapping
            var sizeMap = {
                'Small': '14px',
                'Normal': '18px',
                'Large': '24px',
                'ExtraLarge': '32px'
            };

            // Font mapping
            var fontMap = {
                'Default': 'inherit',
                'Arial': 'Arial, sans-serif',
                'Helvetica': 'Helvetica, sans-serif',
                'Verdana': 'Verdana, sans-serif',
                'TimesNewRoman': '"Times New Roman", serif',
                'Georgia': 'Georgia, serif',
                'CourierNew': '"Courier New", monospace'
            };

            // Shadow mapping
            var shadowMap = {
                'None': 'none',
                'DropShadow': '2px 2px 4px rgba(0,0,0,0.8)',
                'Raised': '-1px -1px 0 rgba(0,0,0,0.5), 1px 1px 0 rgba(255,255,255,0.2)',
                'Depressed': '1px 1px 0 rgba(0,0,0,0.5), -1px -1px 0 rgba(255,255,255,0.2)',
                'Uniform': '0 0 4px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.8)'
            };

            preview.style.fontSize = sizeMap[textSize] || '18px';
            preview.style.fontWeight = textWeight === 'Bold' ? 'bold' : 'normal';
            preview.style.fontFamily = fontMap[font] || 'inherit';
            preview.style.color = textColor || '#FFFFFF';
            preview.style.textShadow = shadowMap[dropShadow] || 'none';
        },

        /**
         * Save subtitle settings
         */
        saveSubtitleSettings: function() {
            var self = this;
            var statusEl = document.getElementById('subtitle-save-status');
            statusEl.innerHTML = '<span class="status-testing">Saving...</span>';

            var settings = {
                // Server-side settings
                subtitleLanguagePreference: document.getElementById('subtitle-lang-input').value.trim(),
                subtitleMode: document.getElementById('subtitle-mode-select').value,

                // Local settings
                burnSubtitles: document.getElementById('burn-subtitles-select').value,
                enablePgsRendering: document.getElementById('pgs-rendering-checkbox').checked,
                alwaysBurnOnTranscode: document.getElementById('always-burn-transcode-checkbox').checked,

                // Appearance settings
                subtitleStyling: document.getElementById('subtitle-styling-select').value,
                textSize: document.getElementById('text-size-select').value,
                textWeight: document.getElementById('text-weight-select').value,
                font: document.getElementById('font-select').value,
                textColor: document.getElementById('text-color-input').value,
                dropShadow: document.getElementById('drop-shadow-select').value,
                verticalPosition: parseInt(document.getElementById('vertical-position-input').value) || -2
            };

            window.JellyfinClient.updateSubtitleSettings(settings)
                .then(function() {
                    statusEl.innerHTML = '<span class="status-success">Settings saved!</span>';
                    self.renderSubtitlesInfo();
                    setTimeout(function() {
                        self.closeSubtitleSettings();
                    }, 1000);
                })
                .catch(function(error) {
                    statusEl.innerHTML = '<span class="status-error">Failed to save: ' + error.message + '</span>';
                });
        },

        /**
         * Close subtitle settings modal
         */
        closeSubtitleSettings: function() {
            var modal = document.getElementById('subtitle-settings-modal');
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        },

        /**
         * Show display settings modal
         */
        showDisplaySettings: function() {
            var self = this;

            var overlay = document.createElement('div');
            overlay.id = 'display-settings-modal';
            overlay.className = 'settings-modal-overlay';

            overlay.innerHTML =
                '<div class="settings-modal settings-modal-large">' +
                    '<h2>Display Settings</h2>' +
                    '<div id="display-settings-content" class="settings-modal-content settings-modal-scrollable">' +
                        '<div class="spinner"></div><p>Loading settings...</p>' +
                    '</div>' +
                    '<div class="settings-modal-buttons">' +
                        '<button id="display-close-btn" class="btn btn-secondary focusable">Close</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            // Load settings from localStorage
            var settings = {
                displayLanguage: localStorage.getItem('jellystream_display_language') || 'Auto',
                dateTimeLocale: localStorage.getItem('jellystream_datetime_locale') || 'Auto',
                displayMode: localStorage.getItem('jellystream_display_mode') || 'Auto',
                theme: localStorage.getItem('jellystream_theme') || 'Dark',
                disableServerCss: localStorage.getItem('jellystream_disable_server_css') === 'true',
                customCss: localStorage.getItem('jellystream_custom_css') || '',
                screensaver: localStorage.getItem('jellystream_screensaver') || 'None',
                screensaverTime: parseInt(localStorage.getItem('jellystream_screensaver_time')) || 180,
                backdropInterval: parseInt(localStorage.getItem('jellystream_backdrop_interval')) || 5,
                fasterAnimations: localStorage.getItem('jellystream_faster_animations') === 'true',
                blurredPlaceholders: localStorage.getItem('jellystream_blurred_placeholders') === 'true',
                libraryPageSize: parseInt(localStorage.getItem('jellystream_library_page_size')) || 100,
                enableBackdrops: localStorage.getItem('jellystream_enable_backdrops') !== 'false',
                enableThemeSongs: localStorage.getItem('jellystream_theme_songs') === 'true',
                enableThemeVideos: localStorage.getItem('jellystream_theme_videos') === 'true',
                displayMissingEpisodes: localStorage.getItem('jellystream_display_missing') === 'true',
                nextUpMaxDays: parseInt(localStorage.getItem('jellystream_nextup_max_days')) || 365,
                enableRewatching: localStorage.getItem('jellystream_enable_rewatching') === 'true',
                useEpisodeImages: localStorage.getItem('jellystream_use_episode_images') === 'true',
                detailsBanner: localStorage.getItem('jellystream_details_banner') !== 'false'
            };

            var content = document.getElementById('display-settings-content');
            content.innerHTML =
                // LOCALIZATION
                '<div class="settings-section-header">Localization</div>' +
                '<div class="form-group">' +
                    '<label>Display Language</label>' +
                    '<p class="form-descriptor">Translating Jellyfin is an ongoing project.</p>' +
                    '<select id="display-language-select" class="focusable">' +
                        '<option value="Auto"' + (settings.displayLanguage === 'Auto' ? ' selected' : '') + '>Auto</option>' +
                        '<option value="en-US"' + (settings.displayLanguage === 'en-US' ? ' selected' : '') + '>English (US)</option>' +
                        '<option value="en-GB"' + (settings.displayLanguage === 'en-GB' ? ' selected' : '') + '>English (UK)</option>' +
                        '<option value="es"' + (settings.displayLanguage === 'es' ? ' selected' : '') + '>Spanish</option>' +
                        '<option value="fr"' + (settings.displayLanguage === 'fr' ? ' selected' : '') + '>French</option>' +
                        '<option value="de"' + (settings.displayLanguage === 'de' ? ' selected' : '') + '>German</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Date Time Locale</label>' +
                    '<select id="datetime-locale-select" class="focusable">' +
                        '<option value="Auto"' + (settings.dateTimeLocale === 'Auto' ? ' selected' : '') + '>Auto</option>' +
                        '<option value="en-US"' + (settings.dateTimeLocale === 'en-US' ? ' selected' : '') + '>English (US)</option>' +
                        '<option value="en-GB"' + (settings.dateTimeLocale === 'en-GB' ? ' selected' : '') + '>English (UK)</option>' +
                        '<option value="es"' + (settings.dateTimeLocale === 'es' ? ' selected' : '') + '>Spanish</option>' +
                        '<option value="fr"' + (settings.dateTimeLocale === 'fr' ? ' selected' : '') + '>French</option>' +
                        '<option value="de"' + (settings.dateTimeLocale === 'de' ? ' selected' : '') + '>German</option>' +
                    '</select>' +
                '</div>' +

                // DISPLAY
                '<div class="settings-section-header">Display</div>' +
                '<div class="form-group">' +
                    '<label>Display Mode</label>' +
                    '<p class="form-descriptor">Select the layout style you want for the interface.</p>' +
                    '<select id="display-mode-select" class="focusable">' +
                        '<option value="Auto"' + (settings.displayMode === 'Auto' ? ' selected' : '') + '>Auto</option>' +
                        '<option value="Desktop"' + (settings.displayMode === 'Desktop' ? ' selected' : '') + '>Desktop</option>' +
                        '<option value="Mobile"' + (settings.displayMode === 'Mobile' ? ' selected' : '') + '>Mobile</option>' +
                        '<option value="TV"' + (settings.displayMode === 'TV' ? ' selected' : '') + '>TV</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Theme</label>' +
                    '<select id="theme-select" class="focusable">' +
                        '<option value="Dark"' + (settings.theme === 'Dark' ? ' selected' : '') + '>Dark</option>' +
                        '<option value="Light"' + (settings.theme === 'Light' ? ' selected' : '') + '>Light</option>' +
                        '<option value="System"' + (settings.theme === 'System' ? ' selected' : '') + '>System</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="disable-server-css-checkbox" class="focusable"' + (settings.disableServerCss ? ' checked' : '') + ' />' +
                        ' Disable server-provided custom CSS code' +
                    '</label>' +
                    '<p class="form-descriptor">Disable custom CSS code for theming/branding provided from the server.</p>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Custom CSS Code</label>' +
                    '<p class="form-descriptor">Custom CSS code for styling which applies to this client only.</p>' +
                    '<textarea id="custom-css-input" class="focusable" rows="4" placeholder="/* Your custom CSS here */">' + self.escapeHtml(settings.customCss) + '</textarea>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Screensaver</label>' +
                    '<select id="screensaver-select" class="focusable">' +
                        '<option value="None"' + (settings.screensaver === 'None' ? ' selected' : '') + '>None</option>' +
                        '<option value="Backdrop"' + (settings.screensaver === 'Backdrop' ? ' selected' : '') + '>Backdrop</option>' +
                        '<option value="Logo"' + (settings.screensaver === 'Logo' ? ' selected' : '') + '>Logo</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Screensaver Time (seconds)</label>' +
                    '<p class="form-descriptor">The amount of time in seconds of inactivity required to start the screensaver.</p>' +
                    '<input type="number" id="screensaver-time-input" class="focusable" min="30" max="600" value="' + settings.screensaverTime + '" />' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Backdrop Screensaver Interval (seconds)</label>' +
                    '<p class="form-descriptor">The time in seconds between different backdrops when using the backdrop screensaver.</p>' +
                    '<input type="number" id="backdrop-interval-input" class="focusable" min="1" max="60" value="' + settings.backdropInterval + '" />' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="faster-animations-checkbox" class="focusable"' + (settings.fasterAnimations ? ' checked' : '') + ' />' +
                        ' Faster animations' +
                    '</label>' +
                    '<p class="form-descriptor">Use faster animations and transitions.</p>' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="blurred-placeholders-checkbox" class="focusable"' + (settings.blurredPlaceholders ? ' checked' : '') + ' />' +
                        ' Enable blurred placeholders for images' +
                    '</label>' +
                    '<p class="form-descriptor">Images that are still being loaded will be displayed with a unique placeholder.</p>' +
                '</div>' +

                // LIBRARIES
                '<div class="settings-section-header">Libraries</div>' +
                '<div class="form-group">' +
                    '<label>Library Page Size</label>' +
                    '<p class="form-descriptor">Set the amount of items to show on a library page. Setting a value of 0 will disable pagination. Values greater than 100 may lead to reduced performance.</p>' +
                    '<input type="number" id="library-page-size-input" class="focusable" min="0" max="500" value="' + settings.libraryPageSize + '" />' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="enable-backdrops-checkbox" class="focusable"' + (settings.enableBackdrops ? ' checked' : '') + ' />' +
                        ' Backdrops' +
                    '</label>' +
                    '<p class="form-descriptor">Display the backdrops in the background of some pages while browsing the library.</p>' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="theme-songs-checkbox" class="focusable"' + (settings.enableThemeSongs ? ' checked' : '') + ' />' +
                        ' Theme songs' +
                    '</label>' +
                    '<p class="form-descriptor">Play the theme songs in background while browsing the library.</p>' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="theme-videos-checkbox" class="focusable"' + (settings.enableThemeVideos ? ' checked' : '') + ' />' +
                        ' Theme videos' +
                    '</label>' +
                    '<p class="form-descriptor">Play theme videos in the background while browsing the library.</p>' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="display-missing-checkbox" class="focusable"' + (settings.displayMissingEpisodes ? ' checked' : '') + ' />' +
                        ' Display missing episodes within seasons' +
                    '</label>' +
                    '<p class="form-descriptor">This must also be enabled for TV libraries in the server configuration.</p>' +
                '</div>' +

                // NEXT UP
                '<div class="settings-section-header">Next Up</div>' +
                '<div class="form-group">' +
                    '<label>Max Days in \'Next Up\'</label>' +
                    '<p class="form-descriptor">Set the maximum amount of days a show should stay in the \'Next Up\' list without watching it.</p>' +
                    '<input type="number" id="nextup-max-days-input" class="focusable" min="1" max="9999" value="' + settings.nextUpMaxDays + '" />' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="enable-rewatching-checkbox" class="focusable"' + (settings.enableRewatching ? ' checked' : '') + ' />' +
                        ' Enable Rewatching in Next Up' +
                    '</label>' +
                    '<p class="form-descriptor">Enable showing already watched episodes in \'Next Up\' sections.</p>' +
                '</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="use-episode-images-checkbox" class="focusable"' + (settings.useEpisodeImages ? ' checked' : '') + ' />' +
                        ' Use episode images in \'Next Up\' and \'Continue Watching\' sections' +
                    '</label>' +
                    '<p class="form-descriptor">\'Next Up\' and \'Continue Watching\' sections will use episode images as thumbnails instead of the primary thumbnail of the show.</p>' +
                '</div>' +

                // ITEM DETAILS
                '<div class="settings-section-header">Item Details</div>' +
                '<div class="form-group form-checkbox">' +
                    '<label>' +
                        '<input type="checkbox" id="details-banner-checkbox" class="focusable"' + (settings.detailsBanner ? ' checked' : '') + ' />' +
                        ' Details Banner' +
                    '</label>' +
                    '<p class="form-descriptor">Display a banner image at the top of the item details page.</p>' +
                '</div>' +

                '<button id="display-save-btn" class="btn btn-primary focusable" style="margin-top: 20px;">Save Changes</button>' +
                '<div id="display-save-status" class="settings-modal-status"></div>';

            // Bind save button
            document.getElementById('display-save-btn').addEventListener('click', function() {
                self.saveDisplaySettings();
            });

            // Bind close button
            document.getElementById('display-close-btn').addEventListener('click', function() {
                self.closeDisplaySettings();
            });

            overlay.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    self.closeDisplaySettings();
                }
            });
        },

        /**
         * Save display settings
         */
        saveDisplaySettings: function() {
            var self = this;
            var statusEl = document.getElementById('display-save-status');
            statusEl.innerHTML = '<span class="status-testing">Saving...</span>';

            // Localization
            localStorage.setItem('jellystream_display_language', document.getElementById('display-language-select').value);
            localStorage.setItem('jellystream_datetime_locale', document.getElementById('datetime-locale-select').value);

            // Display
            localStorage.setItem('jellystream_display_mode', document.getElementById('display-mode-select').value);
            localStorage.setItem('jellystream_theme', document.getElementById('theme-select').value);
            localStorage.setItem('jellystream_disable_server_css', document.getElementById('disable-server-css-checkbox').checked);
            localStorage.setItem('jellystream_custom_css', document.getElementById('custom-css-input').value);
            localStorage.setItem('jellystream_screensaver', document.getElementById('screensaver-select').value);
            localStorage.setItem('jellystream_screensaver_time', document.getElementById('screensaver-time-input').value);
            localStorage.setItem('jellystream_backdrop_interval', document.getElementById('backdrop-interval-input').value);
            localStorage.setItem('jellystream_faster_animations', document.getElementById('faster-animations-checkbox').checked);
            localStorage.setItem('jellystream_blurred_placeholders', document.getElementById('blurred-placeholders-checkbox').checked);

            // Libraries
            localStorage.setItem('jellystream_library_page_size', document.getElementById('library-page-size-input').value);
            localStorage.setItem('jellystream_enable_backdrops', document.getElementById('enable-backdrops-checkbox').checked);
            localStorage.setItem('jellystream_theme_songs', document.getElementById('theme-songs-checkbox').checked);
            localStorage.setItem('jellystream_theme_videos', document.getElementById('theme-videos-checkbox').checked);
            localStorage.setItem('jellystream_display_missing', document.getElementById('display-missing-checkbox').checked);

            // Next Up
            localStorage.setItem('jellystream_nextup_max_days', document.getElementById('nextup-max-days-input').value);
            localStorage.setItem('jellystream_enable_rewatching', document.getElementById('enable-rewatching-checkbox').checked);
            localStorage.setItem('jellystream_use_episode_images', document.getElementById('use-episode-images-checkbox').checked);

            // Item Details
            localStorage.setItem('jellystream_details_banner', document.getElementById('details-banner-checkbox').checked);

            statusEl.innerHTML = '<span class="status-success">Settings saved!</span>';
            self.renderDisplayInfo();
            setTimeout(function() {
                self.closeDisplaySettings();
            }, 1000);
        },

        /**
         * Close display settings modal
         */
        closeDisplaySettings: function() {
            var modal = document.getElementById('display-settings-modal');
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        },

        /**
         * Show plugins modal
         */
        showPluginsModal: function() {
            var self = this;

            var overlay = document.createElement('div');
            overlay.id = 'plugins-modal';
            overlay.className = 'settings-modal-overlay';

            overlay.innerHTML =
                '<div class="settings-modal settings-modal-large">' +
                    '<h2>Installed Plugins</h2>' +
                    '<div id="plugins-list-content" class="settings-modal-content plugins-list">' +
                        '<div class="spinner"></div><p>Loading plugins...</p>' +
                    '</div>' +
                    '<div class="settings-modal-buttons">' +
                        '<button id="plugins-close-btn" class="btn btn-secondary focusable">Close</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            // Load plugins
            window.JellyfinClient.getPlugins()
                .then(function(plugins) {
                    var content = document.getElementById('plugins-list-content');

                    if (!plugins || !Array.isArray(plugins) || plugins.length === 0) {
                        content.innerHTML = '<p>No plugins installed or unable to access plugin list.</p>';
                        return;
                    }

                    var html = '<div class="plugins-grid">';
                    plugins.forEach(function(plugin) {
                        var statusClass = plugin.Status === 'Active' ? 'plugin-active' : 'plugin-inactive';
                        var statusText = plugin.Status === 'Active' ? 'Active' : 'Inactive';

                        html +=
                            '<div class="plugin-card ' + statusClass + '">' +
                                '<div class="plugin-header">' +
                                    '<span class="plugin-name">' + self.escapeHtml(plugin.Name) + '</span>' +
                                    '<span class="plugin-status">' + statusText + '</span>' +
                                '</div>' +
                                '<div class="plugin-info">' +
                                    '<span class="plugin-version">v' + self.escapeHtml(plugin.Version) + '</span>' +
                                '</div>' +
                                (plugin.Description ? '<p class="plugin-desc">' + self.escapeHtml(plugin.Description) + '</p>' : '') +
                            '</div>';
                    });
                    html += '</div>';

                    content.innerHTML = html;
                })
                .catch(function(error) {
                    var content = document.getElementById('plugins-list-content');
                    content.innerHTML =
                        '<div style="text-align: center; padding: 40px;">' +
                            '<p style="margin-bottom: 16px;">Plugin list requires administrator access.</p>' +
                            '<p style="color: var(--color-text-secondary);">To view plugins, access your Jellyfin server\'s Dashboard → Plugins section directly.</p>' +
                        '</div>';
                });

            // Bind close button
            document.getElementById('plugins-close-btn').addEventListener('click', function() {
                self.closePluginsModal();
            });

            overlay.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    self.closePluginsModal();
                }
            });
        },

        /**
         * Close plugins modal
         */
        closePluginsModal: function() {
            var modal = document.getElementById('plugins-modal');
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        },

        /**
         * Render Jellyseerr information
         */
        renderJellyseerrInfo: function() {
            var container = document.getElementById('settings-jellyseerr-info');
            if (!container) return;

            var state = window.StateManager;
            var isConnected = state.jellyseerr.connected;
            var serverUrl = state.jellyseerr.serverUrl || 'Not configured';

            // Parse URL to show cleaner version
            var displayUrl = serverUrl;
            if (isConnected && serverUrl) {
                try {
                    var url = new URL(serverUrl);
                    displayUrl = url.hostname;
                } catch (e) {
                    // Use as-is if parsing fails
                }
            }

            var statusClass = isConnected ? 'settings-status-connected' : 'settings-status-disconnected';
            var statusText = isConnected ? 'Connected' : 'Not Connected';

            container.innerHTML =
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Server</span>' +
                    '<span class="settings-value">' + this.escapeHtml(displayUrl) + '</span>' +
                '</div>' +
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Status</span>' +
                    '<span class="settings-value ' + statusClass + '">' + statusText + '</span>' +
                '</div>';
        },

        /**
         * Show Jellyseerr configuration modal
         */
        showJellyseerrConfig: function() {
            var self = this;
            var state = window.StateManager;

            // Get current values
            var currentUrl = state.jellyseerr.serverUrl || '';
            var currentKey = state.jellyseerr.apiKey || '';

            // Create modal
            var overlay = document.createElement('div');
            overlay.id = 'jellyseerr-config-modal';
            overlay.className = 'settings-modal-overlay';

            overlay.innerHTML =
                '<div class="settings-modal">' +
                    '<h2>Configure Jellyseerr</h2>' +
                    '<p class="settings-modal-hint">Enter your Jellyseerr server URL and API key to enable content discovery and requests.</p>' +
                    '<div class="form-group">' +
                        '<label for="jellyseerr-url-input">Server URL</label>' +
                        '<input type="text" id="jellyseerr-url-input" class="focusable" placeholder="https://jellyseerr.example.com" value="' + this.escapeHtml(currentUrl) + '" />' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="jellyseerr-key-input">API Key</label>' +
                        '<input type="password" id="jellyseerr-key-input" class="focusable" placeholder="Your API key" value="' + this.escapeHtml(currentKey) + '" />' +
                        '<p class="form-hint">Find your API key in Jellyseerr Settings → General</p>' +
                    '</div>' +
                    '<div id="jellyseerr-config-status" class="settings-modal-status"></div>' +
                    '<div class="settings-modal-buttons">' +
                        '<button id="jellyseerr-test-btn" class="btn btn-secondary focusable">Test Connection</button>' +
                        '<button id="jellyseerr-save-btn" class="btn btn-primary focusable">Save</button>' +
                        '<button id="jellyseerr-cancel-btn" class="btn btn-secondary focusable">Cancel</button>' +
                    '</div>' +
                    '<div class="settings-modal-disconnect" id="jellyseerr-disconnect-section" style="' + (state.jellyseerr.connected ? '' : 'display:none;') + '">' +
                        '<hr style="margin: 20px 0; border-color: #444;">' +
                        '<button id="jellyseerr-disconnect-btn" class="btn btn-danger focusable">Disconnect Jellyseerr</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            // Bind events
            document.getElementById('jellyseerr-test-btn').addEventListener('click', function() {
                self.testJellyseerrConnection();
            });

            document.getElementById('jellyseerr-save-btn').addEventListener('click', function() {
                self.saveJellyseerrConfig();
            });

            document.getElementById('jellyseerr-cancel-btn').addEventListener('click', function() {
                self.closeJellyseerrConfig();
            });

            var disconnectBtn = document.getElementById('jellyseerr-disconnect-btn');
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', function() {
                    self.disconnectJellyseerr();
                });
            }

            // Focus first input
            setTimeout(function() {
                var urlInput = document.getElementById('jellyseerr-url-input');
                if (urlInput) {
                    urlInput.focus();
                }
            }, 100);

            // Handle Escape key
            overlay.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    self.closeJellyseerrConfig();
                }
            });
        },

        /**
         * Test Jellyseerr connection
         */
        testJellyseerrConnection: function() {
            var urlInput = document.getElementById('jellyseerr-url-input');
            var keyInput = document.getElementById('jellyseerr-key-input');
            var statusEl = document.getElementById('jellyseerr-config-status');

            var serverUrl = urlInput.value.trim();
            var apiKey = keyInput.value.trim();

            if (!serverUrl || !apiKey) {
                statusEl.innerHTML = '<span class="status-error">Please enter both URL and API key</span>';
                return;
            }

            // Validate and fix URL format
            serverUrl = this.normalizeUrl(serverUrl);
            if (!serverUrl) {
                statusEl.innerHTML = '<span class="status-error">Invalid URL format</span>';
                return;
            }

            // Update input with normalized URL
            urlInput.value = serverUrl;

            statusEl.innerHTML = '<span class="status-testing">Testing connection to ' + serverUrl + '...</span>';

            // Temporarily initialize client for testing
            window.JellyseerrClient.init(serverUrl, apiKey);

            window.JellyseerrClient.testConnection()
                .then(function(result) {
                    if (result.success) {
                        statusEl.innerHTML = '<span class="status-success">Connection successful! Version: ' + result.version + '</span>';
                    } else {
                        statusEl.innerHTML = '<span class="status-error">Connection failed: ' + result.error + '</span>';
                    }
                })
                .catch(function(error) {
                    statusEl.innerHTML = '<span class="status-error">Connection failed: ' + error.message + '</span>';
                });
        },

        /**
         * Normalize URL (add https:// if missing, remove trailing slash)
         */
        normalizeUrl: function(url) {
            if (!url) return null;

            url = url.trim();

            // Add protocol if missing
            if (!url.match(/^https?:\/\//i)) {
                url = 'https://' + url;
            }

            // Remove trailing slash
            url = url.replace(/\/+$/, '');

            // Validate URL
            try {
                new URL(url);
                return url;
            } catch (e) {
                return null;
            }
        },

        /**
         * Save Jellyseerr configuration
         */
        saveJellyseerrConfig: function() {
            var self = this;
            var urlInput = document.getElementById('jellyseerr-url-input');
            var keyInput = document.getElementById('jellyseerr-key-input');
            var statusEl = document.getElementById('jellyseerr-config-status');

            var serverUrl = urlInput.value.trim();
            var apiKey = keyInput.value.trim();

            if (!serverUrl || !apiKey) {
                statusEl.innerHTML = '<span class="status-error">Please enter both URL and API key</span>';
                return;
            }

            // Normalize URL
            serverUrl = this.normalizeUrl(serverUrl);
            if (!serverUrl) {
                statusEl.innerHTML = '<span class="status-error">Invalid URL format</span>';
                return;
            }

            statusEl.innerHTML = '<span class="status-testing">Saving...</span>';

            // Initialize client
            window.JellyseerrClient.init(serverUrl, apiKey);

            // Test connection before saving
            window.JellyseerrClient.testConnection()
                .then(function(result) {
                    if (result.success) {
                        // Save to state
                        window.StateManager.setJellyseerrAuth(serverUrl, apiKey);

                        statusEl.innerHTML = '<span class="status-success">Connected and saved!</span>';

                        // Close modal after short delay
                        setTimeout(function() {
                            self.closeJellyseerrConfig();
                            self.renderJellyseerrInfo();
                            self.showToast('Jellyseerr connected successfully');
                        }, 1000);
                    } else {
                        statusEl.innerHTML = '<span class="status-error">Connection failed: ' + result.error + '</span>';
                    }
                })
                .catch(function(error) {
                    statusEl.innerHTML = '<span class="status-error">Connection failed: ' + error.message + '</span>';
                });
        },

        /**
         * Disconnect Jellyseerr
         */
        disconnectJellyseerr: function() {
            var self = this;

            if (confirm('Disconnect from Jellyseerr? You will lose access to content discovery and requests.')) {
                // Clear Jellyseerr state
                window.StateManager.jellyseerr = {
                    connected: false,
                    serverUrl: null,
                    apiKey: null
                };
                window.StateManager.saveToStorage();

                this.closeJellyseerrConfig();
                this.renderJellyseerrInfo();
                this.showToast('Jellyseerr disconnected');
            }
        },

        /**
         * Close Jellyseerr config modal
         */
        closeJellyseerrConfig: function() {
            var modal = document.getElementById('jellyseerr-config-modal');
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        },

        /**
         * Render app information
         */
        renderAppInfo: function() {
            var container = document.getElementById('settings-app-info');
            if (!container) return;

            var deviceId = localStorage.getItem('jellystream_device_id') || 'Unknown';

            container.innerHTML =
                '<div class="settings-info-row">' +
                    '<span class="settings-label">App Version</span>' +
                    '<span class="settings-value">1.0.0</span>' +
                '</div>' +
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Device ID</span>' +
                    '<span class="settings-value settings-value-mono">' + this.escapeHtml(deviceId.substring(0, 20)) + '...</span>' +
                '</div>' +
                '<div class="settings-info-row">' +
                    '<span class="settings-label">Platform</span>' +
                    '<span class="settings-value">Samsung Tizen TV</span>' +
                '</div>';
        },

        /**
         * Handle logout
         */
        handleLogout: function() {
            console.log('SettingsScreen: Logging out');

            if (confirm('Are you sure you want to log out?')) {
                // Clear stored credentials
                localStorage.removeItem('jellystream_auth');
                localStorage.removeItem('jellystream_server');

                // Reset state
                if (window.StateManager) {
                    window.StateManager.jellyfin = {
                        serverUrl: null,
                        userId: null,
                        accessToken: null,
                        userName: null,
                        serverName: null
                    };
                    window.StateManager.auth.isAuthenticated = false;
                }

                // Navigate to login
                if (window.Router) {
                    window.Router.navigateTo('#/login');
                }
            }
        },

        /**
         * Handle clear cache
         */
        handleClearCache: function() {
            console.log('SettingsScreen: Clearing cache');

            if (confirm('Clear all cached data? This will not log you out.')) {
                // Clear any cached data (future: images, search history, etc.)
                localStorage.removeItem('jellystream_recent_searches');
                localStorage.removeItem('jellystream_cache');

                // Show confirmation
                this.showToast('Cache cleared successfully');
            }
        },

        /**
         * Handle switch server
         */
        handleSwitchServer: function() {
            console.log('SettingsScreen: Switching server');

            if (confirm('Switch to a different server? You will need to log in again.')) {
                // Clear server-specific data but keep device ID
                localStorage.removeItem('jellystream_auth');
                localStorage.removeItem('jellystream_server');

                // Reset state
                if (window.StateManager) {
                    window.StateManager.jellyfin = {
                        serverUrl: null,
                        userId: null,
                        accessToken: null,
                        userName: null,
                        serverName: null
                    };
                    window.StateManager.auth.isAuthenticated = false;
                }

                // Navigate to login
                if (window.Router) {
                    window.Router.navigateTo('#/login');
                }
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

            // Auto-remove after 3 seconds
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
    window.SettingsScreen = SettingsScreen;

})(window, document);
