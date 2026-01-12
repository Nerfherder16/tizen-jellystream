/**
 * JellyStream - Jellyfin API Client
 * Handles all communication with Jellyfin server
 */
(function(window) {
    'use strict';

    var JellyfinClient = {
        _baseUrl: null,
        _userId: null,
        _accessToken: null,
        _deviceId: null,
        _serverId: null,
        _initialized: false,

        /**
         * Initialize the API client
         */
        init: function(baseUrl, userId, accessToken, deviceId, serverId) {
            this._baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : null;
            this._userId = userId;
            this._accessToken = accessToken;
            this._deviceId = deviceId || this._generateDeviceId();
            this._serverId = serverId;
            this._initialized = !!(this._baseUrl && this._accessToken);

            console.log('JellyfinClient: Initialized', {
                baseUrl: this._baseUrl,
                userId: this._userId,
                hasToken: !!this._accessToken,
                deviceId: this._deviceId,
                initialized: this._initialized
            });
            return this._initialized;
        },

        /**
         * Initialize with API key (bypasses SSO)
         */
        initWithApiKey: function(baseUrl, apiKey, userId) {
            this._baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : null;
            this._accessToken = apiKey;
            this._userId = userId;
            this._deviceId = this._generateDeviceId();
            this._initialized = !!(this._baseUrl && this._accessToken);

            console.log('JellyfinClient: Initialized with API key', this._initialized);
            return this._initialized;
        },

        /**
         * Generate a device ID for this Tizen TV
         */
        _generateDeviceId: function() {
            var stored = localStorage.getItem('jellystream_device_id');
            if (stored) return stored;

            var deviceId = 'jellystream_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('jellystream_device_id', deviceId);
            return deviceId;
        },

        /**
         * Get authorization header
         */
        _getAuthHeader: function() {
            var parts = [
                'MediaBrowser',
                'Client="JellyStream"',
                'Device="Samsung TV"',
                'DeviceId="' + this._deviceId + '"',
                'Version="1.0.0"'
            ];

            if (this._accessToken) {
                // API keys use Token, not quoted
                parts.push('Token=' + this._accessToken);
            }

            return parts.join(', ');
        },

        /**
         * Make an API request to Jellyfin
         */
        _request: function(endpoint, options) {
            options = options || {};

            if (!this._baseUrl) {
                return Promise.reject(new Error('Jellyfin API not configured'));
            }

            // Add api_key query parameter for authentication (SSO plugin breaks X-Emby-Authorization header)
            var url = this._baseUrl + endpoint;
            if (this._accessToken) {
                var separator = endpoint.indexOf('?') === -1 ? '?' : '&';
                url += separator + 'api_key=' + this._accessToken;
            }

            var fetchOptions = {
                method: options.method || 'GET',
                headers: {
                    'X-Emby-Authorization': this._getAuthHeader(),
                    'Content-Type': 'application/json'
                }
            };

            if (options.body) {
                fetchOptions.body = JSON.stringify(options.body);
            }

            return fetch(url, fetchOptions)
                .then(function(response) {
                    if (!response.ok) {
                        return response.text().then(function(text) {
                            var errorMsg = 'Jellyfin API error: ' + response.status;
                            if (text) {
                                errorMsg += ' - ' + text;
                            }
                            if (response.status === 401) {
                                errorMsg += '\n\nAPI Key authentication failed. Please check:\n- API Key is correct\n- API Key hasn\'t been deleted\n- User ID matches the API Key';
                            }
                            throw new Error(errorMsg);
                        });
                    }
                    return response.json();
                })
                .catch(function(error) {
                    console.error('JellyfinClient: Request failed', endpoint, error);
                    throw error;
                });
        },

        /**
         * Authenticate with username and password
         */
        authenticateByName: function(serverUrl, username, password) {
            var self = this;
            this._baseUrl = serverUrl.replace(/\/$/, '');

            // Ensure device ID is generated before making auth request
            if (!this._deviceId) {
                this._deviceId = this._generateDeviceId();
            }

            var url = this._baseUrl + '/Users/AuthenticateByName';
            var body = {
                Username: username,
                Pw: password
            };

            // Make request without using _request helper to avoid auth header issues
            return fetch(url, {
                method: 'POST',
                headers: {
                    'X-Emby-Authorization': this._getAuthHeader(),
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            })
            .then(function(response) {
                if (!response.ok) {
                    return response.text().then(function(text) {
                        throw new Error('Authentication failed: ' + response.status + ' - ' + text);
                    });
                }
                return response.json();
            })
            .then(function(response) {
                return {
                    success: true,
                    userId: response.User.Id,
                    userName: response.User.Name,
                    accessToken: response.AccessToken,
                    serverId: response.ServerId
                };
            })
            .catch(function(error) {
                console.error('JellyfinClient: Authentication error', error);
                return {
                    success: false,
                    error: error.message
                };
            });
        },

        /**
         * Initiate Quick Connect
         */
        initiateQuickConnect: function(serverUrl) {
            // Ensure device ID is generated and stored
            if (!this._deviceId) {
                this._deviceId = this._generateDeviceId();
                console.log('Generated device ID:', this._deviceId);
            }

            var url = serverUrl.replace(/\/$/, '') + '/QuickConnect/Initiate';
            var authHeader = this._getAuthHeader();

            console.log('=== Quick Connect Initiate ===');
            console.log('URL:', url);
            console.log('Device ID:', this._deviceId);
            console.log('Auth Header:', authHeader);

            return fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Emby-Authorization': authHeader
                }
            })
            .then(function(response) {
                console.log('Response status:', response.status, response.statusText);

                // Always read the response body for debugging
                return response.text().then(function(text) {
                    console.log('Response body:', text);

                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status + ': ' + text);
                    }

                    return JSON.parse(text);
                });
            })
            .then(function(response) {
                console.log('Quick Connect SUCCESS:', response);
                return {
                    success: true,
                    code: response.Code,
                    secret: response.Secret
                };
            })
            .catch(function(error) {
                console.error('Quick Connect FAILED:', error);
                return {
                    success: false,
                    error: error.message
                };
            });
        },

        /**
         * Check Quick Connect status
         */
        checkQuickConnect: function(serverUrl, secret) {
            var url = serverUrl + '/QuickConnect/Connect?secret=' + encodeURIComponent(secret);

            return fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Emby-Authorization': this._getAuthHeader()
                }
            })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function(response) {
                return {
                    authenticated: response.Authenticated === true,
                    secret: response.Secret,
                    code: response.Code
                };
            })
            .catch(function(error) {
                console.error('Quick Connect check failed:', error);
                return {
                    authenticated: false,
                    error: error.message
                };
            });
        },

        /**
         * Complete Quick Connect authentication
         */
        authorizeQuickConnect: function(serverUrl, secret) {
            var url = serverUrl + '/Users/AuthenticateWithQuickConnect';

            return fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Emby-Authorization': this._getAuthHeader()
                },
                body: JSON.stringify({
                    Secret: secret
                })
            })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }
                return response.json();
            })
            .then(function(response) {
                console.log('Quick Connect auth response:', response);
                return {
                    success: true,
                    userId: response.User.Id,
                    userName: response.User.Name,
                    accessToken: response.AccessToken,
                    serverId: response.ServerId
                };
            })
            .catch(function(error) {
                console.error('Quick Connect authorization failed:', error);
                return {
                    success: false,
                    error: error.message
                };
            });
        },

        /**
         * Get user libraries/views
         */
        getUserViews: function() {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            return this._request('/Users/' + this._userId + '/Views');
        },

        /**
         * Get items from a library
         */
        getItems: function(options) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            options = options || {};
            var params = [];

            if (options.parentId) params.push('ParentId=' + options.parentId);
            if (options.sortBy) params.push('SortBy=' + options.sortBy);
            if (options.sortOrder) params.push('SortOrder=' + options.sortOrder);
            if (options.limit) params.push('Limit=' + options.limit);
            if (options.startIndex) params.push('StartIndex=' + options.startIndex);
            if (options.includeItemTypes) params.push('IncludeItemTypes=' + options.includeItemTypes);
            if (options.recursive !== undefined) params.push('Recursive=' + options.recursive);
            if (options.fields) params.push('Fields=' + options.fields);

            var queryString = params.length ? '?' + params.join('&') : '';
            return this._request('/Users/' + this._userId + '/Items' + queryString);
        },

        /**
         * Get continue watching / resume items
         */
        getResumeItems: function(limit) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            // Use the dedicated Resume endpoint
            return this._request('/Users/' + this._userId + '/Items/Resume?Limit=' + (limit || 12) + '&Fields=PrimaryImageAspectRatio');
        },

        /**
         * Get latest items
         */
        getLatestItems: function(parentId, limit) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            var endpoint = '/Users/' + this._userId + '/Items/Latest';
            var params = [];
            if (parentId) params.push('ParentId=' + parentId);
            if (limit) params.push('Limit=' + limit);

            var queryString = params.length ? '?' + params.join('&') : '';
            return this._request(endpoint + queryString);
        },

        /**
         * Search for items
         */
        search: function(query, options) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            options = options || {};
            var params = ['SearchTerm=' + encodeURIComponent(query)];

            if (options.includeItemTypes) params.push('IncludeItemTypes=' + options.includeItemTypes);
            if (options.limit) params.push('Limit=' + options.limit);
            if (options.recursive) params.push('Recursive=true');
            if (options.fields) params.push('Fields=' + options.fields);

            var queryString = '?' + params.join('&');
            return this._request('/Users/' + this._userId + '/Items' + queryString);
        },

        /**
         * Get item details (full details including trailers, overview, etc.)
         */
        getItem: function(itemId) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            // Request all useful fields for full details view
            var fields = [
                'Overview',
                'Genres',
                'RemoteTrailers',
                'People',
                'Studios',
                'ProductionLocations',
                'ExternalUrls',
                'ProviderIds',
                'MediaSources',
                'Chapters',
                'Tags'
            ].join(',');

            return this._request('/Users/' + this._userId + '/Items/' + itemId + '?Fields=' + fields);
        },

        /**
         * Get playback info
         */
        getPlaybackInfo: function(itemId) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            return this._request('/Items/' + itemId + '/PlaybackInfo?UserId=' + this._userId, {
                method: 'POST',
                body: {
                    DeviceProfile: this._getTizenDeviceProfile()
                }
            });
        },

        /**
         * Report playback start
         */
        reportPlaybackStart: function(itemId, positionTicks) {
            return this._request('/Sessions/Playing', {
                method: 'POST',
                body: {
                    ItemId: itemId,
                    PositionTicks: positionTicks || 0,
                    IsPaused: false,
                    IsMuted: false,
                    PlayMethod: 'DirectPlay'
                }
            });
        },

        /**
         * Report playback progress
         */
        reportPlaybackProgress: function(itemId, positionTicks, isPaused) {
            return this._request('/Sessions/Playing/Progress', {
                method: 'POST',
                body: {
                    ItemId: itemId,
                    PositionTicks: positionTicks,
                    IsPaused: isPaused || false,
                    PlayMethod: 'DirectPlay'
                }
            });
        },

        /**
         * Report playback stopped
         */
        reportPlaybackStopped: function(itemId, positionTicks) {
            return this._request('/Sessions/Playing/Stopped', {
                method: 'POST',
                body: {
                    ItemId: itemId,
                    PositionTicks: positionTicks
                }
            });
        },

        /**
         * Get Tizen device profile for codec support
         */
        _getTizenDeviceProfile: function() {
            return {
                MaxStreamingBitrate: 120000000,
                MaxStaticBitrate: 100000000,
                MusicStreamingTranscodingBitrate: 384000,
                DirectPlayProfiles: [
                    { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,mp3,ac3,eac3' },
                    { Container: 'mkv', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,mp3,ac3,eac3' }
                ],
                TranscodingProfiles: [
                    { Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac', Protocol: 'hls' }
                ],
                CodecProfiles: [],
                SubtitleProfiles: [
                    { Format: 'srt', Method: 'External' },
                    { Format: 'vtt', Method: 'External' }
                ]
            };
        },

        /**
         * Test connection to server
         */
        testConnection: function(serverUrl) {
            this._baseUrl = serverUrl.replace(/\/$/, '');

            return this._request('/System/Info/Public')
                .then(function(data) {
                    return {
                        success: true,
                        serverName: data.ServerName,
                        version: data.Version
                    };
                })
                .catch(function(error) {
                    return {
                        success: false,
                        error: error.message
                    };
                });
        },

        /**
         * Check if authenticated
         */
        isAuthenticated: function() {
            return this._initialized && !!this._accessToken;
        },

        /**
         * Get seasons for a series
         */
        getSeasons: function(seriesId) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            // Use Items endpoint with ParentId filter (more reliable for CORS)
            // Sort by IndexNumber to get Season 1, 2, 3... in correct order
            var params = [
                'ParentId=' + seriesId,
                'IncludeItemTypes=Season',
                'SortBy=IndexNumber',
                'SortOrder=Ascending',
                'Fields=ItemCounts,PrimaryImageAspectRatio'
            ];

            return this._request('/Users/' + this._userId + '/Items?' + params.join('&'));
        },

        /**
         * Get episodes for a season
         */
        getEpisodes: function(seriesId, seasonId) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            // Use Items endpoint with ParentId filter (more reliable for CORS)
            // Sort by IndexNumber to get Episode 1, 2, 3... in correct order
            var params = [
                'ParentId=' + seasonId,
                'IncludeItemTypes=Episode',
                'SortBy=IndexNumber',
                'SortOrder=Ascending',
                'Fields=Overview,PrimaryImageAspectRatio'
            ];

            return this._request('/Users/' + this._userId + '/Items?' + params.join('&'));
        },

        /**
         * Get next up episodes (continue watching for TV)
         */
        getNextUp: function(seriesId) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            var params = ['UserId=' + this._userId];
            if (seriesId) {
                params.push('SeriesId=' + seriesId);
            }
            params.push('Fields=PrimaryImageAspectRatio');
            params.push('Limit=1');

            return this._request('/Shows/NextUp?' + params.join('&'));
        },

        /**
         * Get installed plugins
         */
        getPlugins: function() {
            return this._request('/Plugins');
        },

        /**
         * Get user configuration/preferences (from user object)
         */
        getUserConfiguration: function() {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            return this._request('/Users/' + this._userId).then(function(user) {
                return user.Configuration || {};
            });
        },

        /**
         * Update user configuration/preferences
         */
        updateUserConfiguration: function(config) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            var url = this._baseUrl + '/Users/' + this._userId + '/Configuration';
            if (this._accessToken) {
                url += '?api_key=' + this._accessToken;
            }

            return fetch(url, {
                method: 'POST',
                headers: {
                    'X-Emby-Authorization': this._getAuthHeader(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            }).then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to update configuration: ' + response.status);
                }
                // This endpoint returns 204 No Content on success
                return { success: true };
            });
        },

        /**
         * Get display preferences
         */
        getDisplayPreferences: function() {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            return this._request('/DisplayPreferences/usersettings?userId=' + this._userId + '&client=emby');
        },

        /**
         * Get server system info (full, requires auth)
         */
        getSystemInfo: function() {
            return this._request('/System/Info');
        },

        /**
         * Get scheduled tasks
         */
        getScheduledTasks: function() {
            return this._request('/ScheduledTasks');
        },

        /**
         * Get server activity logs
         */
        getActivityLog: function(limit) {
            return this._request('/System/ActivityLog/Entries?Limit=' + (limit || 20));
        },

        /**
         * Get all users (admin only)
         */
        getUsers: function() {
            return this._request('/Users');
        },

        /**
         * Get user by ID with full details
         */
        getUserById: function(userId) {
            return this._request('/Users/' + (userId || this._userId));
        },

        /**
         * Update user password
         */
        updatePassword: function(currentPassword, newPassword) {
            if (!this._userId) {
                return Promise.reject(new Error('Not authenticated'));
            }

            return this._request('/Users/' + this._userId + '/Password', {
                method: 'POST',
                body: {
                    CurrentPw: currentPassword,
                    NewPw: newPassword
                }
            });
        },

        /**
         * Get playback settings from user config
         */
        getPlaybackSettings: function() {
            return this.getUserConfiguration().then(function(config) {
                console.log('User configuration:', config);
                return {
                    // Audio settings
                    audioLanguagePreference: config.AudioLanguagePreference || '',
                    maxAudioChannels: config.MaxAudioChannels || -1,
                    playDefaultAudioTrack: config.PlayDefaultAudioTrack !== false,
                    enableAudioVbr: config.EnableAudioVbr !== false,

                    // Subtitle settings
                    subtitleLanguagePreference: config.SubtitleLanguagePreference || '',
                    subtitleMode: config.SubtitleMode || 'Default',

                    // Video quality
                    maxStreamingBitrate: config.MaxStreamingBitrate || null,
                    limitSupportedVideoResolution: config.LimitSupportedVideoResolution === true,

                    // Advanced settings
                    preferFmp4Hls: config.PreferFmp4HlsContainer === true,

                    // Playback behavior
                    enableNextEpisodeAutoPlay: config.EnableNextEpisodeAutoPlay !== false,
                    enableCinemaMode: config.EnableCinemaMode === true,
                    rememberAudioSelections: config.RememberAudioSelections !== false,
                    rememberSubtitleSelections: config.RememberSubtitleSelections !== false,
                    showNextVideoInfo: config.EnableNextVideoInfoOverlay !== false,

                    // Advanced audio/video
                    enableDts: config.EnableDts !== false,
                    enableTrueHd: config.EnableTrueHd !== false,
                    preferredVideoCodec: config.PreferredVideoCodec || '',
                    preferredAudioCodec: config.PreferredAudioCodec || '',
                    audioNormalization: config.AudioNormalization || 'None',
                    alwaysRemuxFlac: config.AlwaysRemuxFlac === true,
                    alwaysRemuxMp3: config.AlwaysRemuxMp3 === true,

                    // Skip controls (stored locally for now)
                    skipForwardLength: parseInt(localStorage.getItem('jellystream_skip_forward')) || 30000,
                    skipBackLength: parseInt(localStorage.getItem('jellystream_skip_back')) || 10000
                };
            }).catch(function(error) {
                console.error('Failed to get playback settings:', error);
                // Return defaults
                return {
                    audioLanguagePreference: '',
                    maxAudioChannels: -1,
                    playDefaultAudioTrack: true,
                    enableAudioVbr: true,
                    subtitleLanguagePreference: '',
                    subtitleMode: 'Default',
                    maxStreamingBitrate: null,
                    limitSupportedVideoResolution: false,
                    preferFmp4Hls: false,
                    enableNextEpisodeAutoPlay: true,
                    enableCinemaMode: false,
                    rememberAudioSelections: true,
                    rememberSubtitleSelections: true,
                    showNextVideoInfo: true,
                    enableDts: true,
                    enableTrueHd: true,
                    preferredVideoCodec: '',
                    preferredAudioCodec: '',
                    audioNormalization: 'None',
                    alwaysRemuxFlac: false,
                    alwaysRemuxMp3: false,
                    skipForwardLength: 30000,
                    skipBackLength: 10000
                };
            });
        },

        /**
         * Update playback settings
         */
        updatePlaybackSettings: function(settings) {
            var self = this;
            return this.getUserConfiguration().then(function(config) {
                // Merge new settings into existing config
                var updatedConfig = Object.assign({}, config);

                // Audio settings
                if (settings.maxAudioChannels !== undefined) {
                    updatedConfig.MaxAudioChannels = settings.maxAudioChannels;
                }
                if (settings.audioLanguagePreference !== undefined) {
                    updatedConfig.AudioLanguagePreference = settings.audioLanguagePreference;
                }
                if (settings.playDefaultAudioTrack !== undefined) {
                    updatedConfig.PlayDefaultAudioTrack = settings.playDefaultAudioTrack;
                }
                if (settings.enableAudioVbr !== undefined) {
                    updatedConfig.EnableAudioVbr = settings.enableAudioVbr;
                }

                // Subtitle settings
                if (settings.subtitleLanguagePreference !== undefined) {
                    updatedConfig.SubtitleLanguagePreference = settings.subtitleLanguagePreference;
                }
                if (settings.subtitleMode !== undefined) {
                    updatedConfig.SubtitleMode = settings.subtitleMode;
                }

                // Video quality
                if (settings.maxStreamingBitrate !== undefined) {
                    updatedConfig.MaxStreamingBitrate = settings.maxStreamingBitrate;
                }

                // Video quality
                if (settings.limitSupportedVideoResolution !== undefined) {
                    updatedConfig.LimitSupportedVideoResolution = settings.limitSupportedVideoResolution;
                }

                // Advanced settings
                if (settings.preferFmp4Hls !== undefined) {
                    updatedConfig.PreferFmp4HlsContainer = settings.preferFmp4Hls;
                }

                // Playback behavior
                if (settings.enableNextEpisodeAutoPlay !== undefined) {
                    updatedConfig.EnableNextEpisodeAutoPlay = settings.enableNextEpisodeAutoPlay;
                }
                if (settings.enableCinemaMode !== undefined) {
                    updatedConfig.EnableCinemaMode = settings.enableCinemaMode;
                }
                if (settings.rememberAudioSelections !== undefined) {
                    updatedConfig.RememberAudioSelections = settings.rememberAudioSelections;
                }
                if (settings.rememberSubtitleSelections !== undefined) {
                    updatedConfig.RememberSubtitleSelections = settings.rememberSubtitleSelections;
                }

                // Advanced audio/video
                if (settings.enableDts !== undefined) {
                    updatedConfig.EnableDts = settings.enableDts;
                }
                if (settings.enableTrueHd !== undefined) {
                    updatedConfig.EnableTrueHd = settings.enableTrueHd;
                }

                // Audio Advanced
                if (settings.audioNormalization !== undefined) {
                    updatedConfig.AudioNormalization = settings.audioNormalization;
                }
                if (settings.alwaysRemuxFlac !== undefined) {
                    updatedConfig.AlwaysRemuxFlac = settings.alwaysRemuxFlac;
                }
                if (settings.alwaysRemuxMp3 !== undefined) {
                    updatedConfig.AlwaysRemuxMp3 = settings.alwaysRemuxMp3;
                }

                return self.updateUserConfiguration(updatedConfig);
            });
        },

        /**
         * Get subtitle settings from user config
         */
        getSubtitleSettings: function() {
            return this.getUserConfiguration().then(function(config) {
                // Load local appearance settings
                var appearanceSettings = JSON.parse(localStorage.getItem('jellystream_subtitle_appearance') || '{}');

                return {
                    // Subtitle behavior
                    subtitleLanguagePreference: config.SubtitleLanguagePreference || '',
                    subtitleMode: config.SubtitleMode || 'Default',

                    // Burn subtitles (stored locally - client preference)
                    burnSubtitles: localStorage.getItem('jellystream_burn_subtitles') || 'Auto',
                    enablePgsRendering: localStorage.getItem('jellystream_pgs_rendering') === 'true',
                    alwaysBurnOnTranscode: localStorage.getItem('jellystream_always_burn_transcode') === 'true',

                    // Appearance settings (client-side)
                    subtitleStyling: appearanceSettings.styling || 'Auto',
                    textSize: appearanceSettings.textSize || 'Normal',
                    textWeight: appearanceSettings.textWeight || 'Normal',
                    font: appearanceSettings.font || 'Default',
                    textColor: appearanceSettings.textColor || '#FFFFFF',
                    dropShadow: appearanceSettings.dropShadow || 'DropShadow',
                    verticalPosition: appearanceSettings.verticalPosition || -2
                };
            }).catch(function(error) {
                console.error('Failed to get subtitle settings:', error);
                // Return defaults
                return {
                    subtitleLanguagePreference: '',
                    subtitleMode: 'Default',
                    burnSubtitles: 'Auto',
                    enablePgsRendering: false,
                    alwaysBurnOnTranscode: false,
                    subtitleStyling: 'Auto',
                    textSize: 'Normal',
                    textWeight: 'Normal',
                    font: 'Default',
                    textColor: '#FFFFFF',
                    dropShadow: 'DropShadow',
                    verticalPosition: -2
                };
            });
        },

        /**
         * Update subtitle settings
         */
        updateSubtitleSettings: function(settings) {
            var self = this;

            // Save appearance settings locally
            var appearanceSettings = {
                styling: settings.subtitleStyling,
                textSize: settings.textSize,
                textWeight: settings.textWeight,
                font: settings.font,
                textColor: settings.textColor,
                dropShadow: settings.dropShadow,
                verticalPosition: settings.verticalPosition
            };
            localStorage.setItem('jellystream_subtitle_appearance', JSON.stringify(appearanceSettings));

            // Save burn settings locally
            localStorage.setItem('jellystream_burn_subtitles', settings.burnSubtitles);
            localStorage.setItem('jellystream_pgs_rendering', settings.enablePgsRendering);
            localStorage.setItem('jellystream_always_burn_transcode', settings.alwaysBurnOnTranscode);

            // Update server-side settings
            return this.getUserConfiguration().then(function(config) {
                var updatedConfig = Object.assign({}, config);

                if (settings.subtitleLanguagePreference !== undefined) {
                    updatedConfig.SubtitleLanguagePreference = settings.subtitleLanguagePreference;
                }
                if (settings.subtitleMode !== undefined) {
                    updatedConfig.SubtitleMode = settings.subtitleMode;
                }

                return self.updateUserConfiguration(updatedConfig);
            });
        }
    };

    // Export to window
    window.JellyfinClient = JellyfinClient;

})(window);
