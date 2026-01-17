/**
 * JellyStream - Trakt API Client
 * Handles Trakt authentication and data fetching for personalized home page
 */
(function(window) {
    'use strict';

    var TraktClient = {
        _clientId: '45e0060ab5b2325f242c15f128446c0245e32e1f8e38126aa3fc4145ab857722',
        _apiBase: 'https://api.trakt.tv',
        _accessToken: null,
        _refreshToken: null,
        _expiresAt: null,
        _pollInterval: null,
        _initialized: false,

        /**
         * Initialize from stored tokens
         */
        init: function() {
            var stored = StateManager.getTrakt();
            if (stored && stored.accessToken) {
                this._accessToken = stored.accessToken;
                this._refreshToken = stored.refreshToken;
                this._expiresAt = stored.expiresAt;
                this._initialized = true;
                console.log('TraktClient: Initialized with stored tokens');

                // Check if token needs refresh
                if (this._expiresAt && Date.now() > this._expiresAt - 86400000) {
                    console.log('TraktClient: Token expiring soon, refreshing...');
                    this.refreshAccessToken();
                }
            }
            return this._initialized;
        },

        /**
         * Check if user is authenticated with Trakt
         */
        isAuthenticated: function() {
            return this._initialized && !!this._accessToken;
        },

        /**
         * Set tokens directly (used when restoring from StateManager)
         */
        setTokens: function(tokens) {
            if (tokens && tokens.access_token) {
                this._accessToken = tokens.access_token;
                this._refreshToken = tokens.refresh_token;
                this._expiresAt = Date.now() + (tokens.expires_in * 1000);
                this._initialized = true;
                console.log('TraktClient: Tokens set from external source');

                // Check if token needs refresh
                if (this._expiresAt && Date.now() > this._expiresAt - 86400000) {
                    console.log('TraktClient: Token expiring soon, refreshing...');
                    this.refreshAccessToken();
                }
            }
        },

        /**
         * Make API request to Trakt
         */
        _request: function(endpoint, options) {
            var self = this;
            options = options || {};

            var headers = {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': this._clientId
            };

            if (this._accessToken && !options.noAuth) {
                headers['Authorization'] = 'Bearer ' + this._accessToken;
            }

            var fetchOptions = {
                method: options.method || 'GET',
                headers: headers
            };

            if (options.body) {
                fetchOptions.body = JSON.stringify(options.body);
            }

            // DEBUG: Log ALL POST requests to track scrobbling
            if (fetchOptions.method === 'POST') {
                console.log('========================================');
                console.log('TRAKT POST REQUEST DETECTED');
                console.log('Endpoint:', endpoint);
                console.log('Body:', JSON.stringify(options.body, null, 2));
                console.log('Stack trace:', new Error().stack);
                console.log('========================================');
            }

            return fetch(this._apiBase + endpoint, fetchOptions)
                .then(function(response) {
                    if (response.status === 401 && self._refreshToken) {
                        // Token expired, try refresh
                        return self.refreshAccessToken().then(function() {
                            // Retry request with new token
                            headers['Authorization'] = 'Bearer ' + self._accessToken;
                            return fetch(self._apiBase + endpoint, fetchOptions);
                        });
                    }
                    return response;
                })
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Trakt API error: ' + response.status);
                    }
                    // Some endpoints return 204 No Content
                    if (response.status === 204) {
                        return null;
                    }
                    return response.json();
                });
        },

        // ==================== DEVICE AUTH FLOW ====================

        /**
         * Start device authentication flow
         * Returns device code info for user to enter at trakt.tv/activate
         */
        startDeviceAuth: function() {
            var self = this;
            return fetch(this._apiBase + '/oauth/device/code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    client_id: this._clientId
                })
            })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to get device code');
                }
                return response.json();
            })
            .then(function(data) {
                // data contains: device_code, user_code, verification_url, expires_in, interval
                console.log('TraktClient: Device code received', data.user_code);
                return {
                    deviceCode: data.device_code,
                    userCode: data.user_code,
                    verificationUrl: data.verification_url,
                    expiresIn: data.expires_in,
                    interval: data.interval
                };
            });
        },

        /**
         * Poll for device authorization
         * Call this after user enters code at trakt.tv/activate
         * Returns a Promise that resolves with tokens when user authorizes
         */
        pollDeviceAuth: function(deviceCodeData) {
            var self = this;
            var deviceCode = deviceCodeData.deviceCode || deviceCodeData.device_code;
            var pollInterval = ((deviceCodeData.interval || 5) + 1) * 1000; // Add 1 second buffer
            var expiresAt = Date.now() + ((deviceCodeData.expiresIn || deviceCodeData.expires_in || 600) * 1000);

            if (this._pollInterval) {
                clearInterval(this._pollInterval);
            }

            return new Promise(function(resolve, reject) {
                self._pollInterval = setInterval(function() {
                    // Check if expired
                    if (Date.now() > expiresAt) {
                        clearInterval(self._pollInterval);
                        self._pollInterval = null;
                        reject(new Error('Code expired'));
                        return;
                    }

                    fetch(self._apiBase + '/oauth/device/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            code: deviceCode,
                            client_id: self._clientId
                        })
                    })
                    .then(function(response) {
                        if (response.status === 200) {
                            // Success!
                            clearInterval(self._pollInterval);
                            self._pollInterval = null;
                            return response.json();
                        } else if (response.status === 400) {
                            // Still pending, continue polling
                            return null;
                        } else if (response.status === 404) {
                            clearInterval(self._pollInterval);
                            self._pollInterval = null;
                            throw new Error('Invalid device code');
                        } else if (response.status === 409) {
                            clearInterval(self._pollInterval);
                            self._pollInterval = null;
                            throw new Error('Code already used');
                        } else if (response.status === 410) {
                            clearInterval(self._pollInterval);
                            self._pollInterval = null;
                            throw new Error('Code expired');
                        } else if (response.status === 418) {
                            clearInterval(self._pollInterval);
                            self._pollInterval = null;
                            throw new Error('User denied authorization');
                        } else if (response.status === 429) {
                            // Slow down polling - just skip this iteration
                            console.log('TraktClient: Rate limited, slowing down');
                            return null;
                        } else {
                            throw new Error('Unexpected response: ' + response.status);
                        }
                    })
                    .then(function(data) {
                        if (data) {
                            // Got tokens!
                            self._accessToken = data.access_token;
                            self._refreshToken = data.refresh_token;
                            self._expiresAt = Date.now() + (data.expires_in * 1000);
                            self._initialized = true;

                            console.log('TraktClient: Authentication successful');
                            resolve(data);
                        }
                    })
                    .catch(function(error) {
                        console.error('TraktClient: Poll error', error);
                        reject(error);
                    });
                }, pollInterval);
            });
        },

        /**
         * Cancel device auth polling
         */
        cancelDeviceAuth: function() {
            if (this._pollInterval) {
                clearInterval(this._pollInterval);
                this._pollInterval = null;
            }
        },

        /**
         * Refresh access token using refresh token
         */
        refreshAccessToken: function() {
            var self = this;

            if (!this._refreshToken) {
                return Promise.reject(new Error('No refresh token'));
            }

            return fetch(this._apiBase + '/oauth/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refresh_token: this._refreshToken,
                    client_id: this._clientId,
                    grant_type: 'refresh_token'
                })
            })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to refresh token');
                }
                return response.json();
            })
            .then(function(data) {
                self._accessToken = data.access_token;
                self._refreshToken = data.refresh_token;
                self._expiresAt = Date.now() + (data.expires_in * 1000);

                StateManager.setTrakt({
                    accessToken: self._accessToken,
                    refreshToken: self._refreshToken,
                    expiresAt: self._expiresAt
                });

                console.log('TraktClient: Token refreshed');
                return data;
            });
        },

        /**
         * Disconnect/logout from Trakt
         */
        disconnect: function() {
            this._accessToken = null;
            this._refreshToken = null;
            this._expiresAt = null;
            this._initialized = false;
            StateManager.setTrakt(null);
            console.log('TraktClient: Disconnected');
        },

        // ==================== USER DATA ====================

        /**
         * Get user profile
         */
        getProfile: function() {
            return this._request('/users/me');
        },

        /**
         * Get user's watch progress for shows (episodes in progress)
         * Returns shows with next episode to watch
         */
        getShowProgress: function() {
            return this._request('/sync/playback/episodes?limit=20')
                .then(function(data) {
                    // Debug: Log raw API response
                    console.log('=== RAW /sync/playback/episodes RESPONSE ===');
                    console.log(JSON.stringify(data, null, 2));
                    console.log('===========================================');

                    // Filter out items with very low progress (< 10%) - likely accidental plays
                    var filtered = (data || []).filter(function(item) {
                        return item.progress >= 10;
                    });
                    console.log('Filtered playback (>= 10% progress):', filtered.length, 'of', (data || []).length);

                    return filtered;
                });
        },

        /**
         * Remove playback progress for an item
         * Use this to clean up unwanted "in progress" items
         * @param {number} playbackId - The playback ID from getShowProgress response
         */
        removePlaybackProgress: function(playbackId) {
            return this._request('/sync/playback/' + playbackId, { method: 'DELETE' })
                .then(function() {
                    console.log('TraktClient: Removed playback progress', playbackId);
                    return true;
                });
        },

        /**
         * Remove all playback progress (clear "continue watching")
         */
        clearAllPlaybackProgress: function() {
            var self = this;
            return this._request('/sync/playback/episodes?limit=100')
                .then(function(items) {
                    if (!items || items.length === 0) {
                        console.log('TraktClient: No playback progress to clear');
                        return Promise.resolve();
                    }

                    console.log('TraktClient: Clearing', items.length, 'playback items');
                    var promises = items.map(function(item) {
                        return self.removePlaybackProgress(item.id);
                    });
                    return Promise.all(promises);
                })
                .then(function() {
                    console.log('TraktClient: All playback progress cleared');
                });
        },

        /**
         * Get watched shows with their progress
         * For "Continue Watching" - shows you haven't finished
         */
        getWatchedShowsProgress: function() {
            return this._request('/users/me/watched/shows?extended=noseasons')
                .then(function(data) {
                    return data || [];
                });
        },

        /**
         * Get shows with their next episode to watch
         * This is the proper "Up Next" / "Continue Watching" implementation
         * Returns shows sorted by last_watched_at with next_episode info
         */
        getShowsWithNextEpisode: function(limit) {
            var self = this;
            limit = limit || 10;

            console.log('=== getShowsWithNextEpisode START ===');
            console.log('Limit:', limit);

            // First get watched shows sorted by last watched
            return this._request('/users/me/watched/shows?extended=full')
                .then(function(watchedShows) {
                    console.log('Watched shows response:', watchedShows ? watchedShows.length : 'null');

                    if (!watchedShows || watchedShows.length === 0) {
                        console.log('No watched shows found');
                        return [];
                    }

                    // Log all watched shows
                    console.log('=== ALL WATCHED SHOWS ===');
                    watchedShows.forEach(function(ws, i) {
                        console.log(i + ': ' + ws.show.title + ' (last watched: ' + ws.last_watched_at + ')');
                    });
                    console.log('========================');

                    // Sort by last watched (most recent first)
                    watchedShows.sort(function(a, b) {
                        return new Date(b.last_watched_at) - new Date(a.last_watched_at);
                    });

                    // Take top N shows and get their progress
                    var topShows = watchedShows.slice(0, limit);
                    console.log('Top ' + limit + ' shows to check progress for:');
                    topShows.forEach(function(ws, i) {
                        console.log(i + ': ' + ws.show.title + ' (trakt id: ' + ws.show.ids.trakt + ')');
                    });

                    var progressPromises = topShows.map(function(watchedShow) {
                        var showId = watchedShow.show.ids.trakt;
                        var showTitle = watchedShow.show.title;
                        return self._request('/shows/' + showId + '/progress/watched?extended=full')
                            .then(function(progress) {
                                console.log('Progress for "' + showTitle + '":');
                                console.log('  - completed:', progress ? progress.completed : 'no progress');
                                console.log('  - aired:', progress ? progress.aired : 'N/A');
                                console.log('  - next_episode:', progress && progress.next_episode ?
                                    'S' + progress.next_episode.season + 'E' + progress.next_episode.number + ' - ' + progress.next_episode.title :
                                    'NONE');
                                return {
                                    show: watchedShow.show,
                                    last_watched_at: watchedShow.last_watched_at,
                                    progress: progress
                                };
                            })
                            .catch(function(err) {
                                console.error('Failed to get progress for "' + showTitle + '":', err);
                                return null;
                            });
                    });

                    return Promise.all(progressPromises);
                })
                .then(function(results) {
                    console.log('=== FILTERING RESULTS ===');
                    console.log('Total results before filter:', results.length);

                    // Log each result and why it passes/fails
                    results.forEach(function(item, i) {
                        if (!item) {
                            console.log(i + ': NULL (skipped)');
                            return;
                        }
                        var show = item.show ? item.show.title : 'Unknown';
                        var hasProgress = !!item.progress;
                        var hasNextEp = hasProgress && !!item.progress.next_episode;
                        // Show is fully completed when completed >= aired (all aired episodes watched)
                        var isFullyCompleted = hasProgress && item.progress.completed >= item.progress.aired;
                        var passes = hasProgress && hasNextEp && !isFullyCompleted;
                        console.log(i + ': "' + show + '" - progress:' + hasProgress + ', next_ep:' + hasNextEp +
                            ', completed:' + (item.progress ? item.progress.completed : 0) + '/' + (item.progress ? item.progress.aired : 0) +
                            ', fullyCompleted:' + isFullyCompleted + ' => ' + (passes ? 'PASS' : 'FAIL'));
                    });

                    // Filter out nulls and shows that are completed or have no next episode
                    // Note: completed is a COUNT, not a boolean. Show is done when completed >= aired
                    var filtered = results.filter(function(item) {
                        return item &&
                               item.progress &&
                               item.progress.next_episode &&
                               (item.progress.completed < item.progress.aired);
                    }).map(function(item) {
                        // Format for home screen consumption
                        return {
                            show: item.show,
                            episode: item.progress.next_episode,
                            last_watched_at: item.last_watched_at,
                            aired: item.progress.aired,
                            completed: item.progress.completed,
                            last_episode: item.progress.last_episode
                        };
                    });

                    console.log('=== FINAL RESULTS ===');
                    console.log('Shows with next episode:', filtered.length);
                    filtered.forEach(function(f, i) {
                        console.log(i + ': "' + f.show.title + '" - S' + f.episode.season + 'E' + f.episode.number);
                    });
                    console.log('=====================');

                    return filtered;
                })
                .catch(function(err) {
                    console.error('=== getShowsWithNextEpisode ERROR ===');
                    console.error(err);
                    return [];
                });
        },

        /**
         * Get recently watched episodes
         */
        getRecentEpisodes: function(limit) {
            limit = limit || 20;
            return this._request('/users/me/history/episodes?limit=' + limit)
                .then(function(data) {
                    // Debug: Log raw API response
                    console.log('=== RAW /users/me/history/episodes RESPONSE ===');
                    if (data && data.length > 0) {
                        data.slice(0, 10).forEach(function(item, i) {
                            console.log(i + ': ' + (item.show ? item.show.title : 'NO SHOW') +
                                ' - S' + (item.episode ? item.episode.season : '?') +
                                'E' + (item.episode ? item.episode.number : '?'));
                        });
                    }
                    console.log('===============================================');
                    return data || [];
                });
        },

        /**
         * Get recently watched movies
         */
        getRecentMovies: function(limit) {
            limit = limit || 20;
            return this._request('/users/me/history/movies?limit=' + limit)
                .then(function(data) {
                    return data || [];
                });
        },

        /**
         * Get upcoming episodes for shows user is watching
         * Uses my calendar - shows airing in next 30 days for shows in watchlist/watched
         */
        getUpcomingEpisodes: function(days) {
            days = days || 30;
            var today = new Date().toISOString().split('T')[0];
            return this._request('/calendars/my/shows/' + today + '/' + days)
                .then(function(data) {
                    return data || [];
                });
        },

        /**
         * Get watchlist (shows user wants to watch)
         */
        getShowWatchlist: function() {
            return this._request('/users/me/watchlist/shows?extended=full')
                .then(function(data) {
                    return data || [];
                });
        },

        /**
         * Get movie watchlist
         */
        getMovieWatchlist: function() {
            return this._request('/users/me/watchlist/movies?extended=full')
                .then(function(data) {
                    return data || [];
                });
        },

        /**
         * Get all watched movies (just IDs for efficient lookup)
         * Returns a Set of Trakt movie IDs
         */
        getWatchedMovieIds: function() {
            return this._request('/users/me/watched/movies')
                .then(function(data) {
                    var ids = new Set();
                    (data || []).forEach(function(item) {
                        if (item.movie && item.movie.ids && item.movie.ids.trakt) {
                            ids.add(item.movie.ids.trakt);
                        }
                    });
                    return ids;
                });
        },

        /**
         * Get all watched shows (just IDs for efficient lookup)
         * Returns a Set of Trakt show IDs
         */
        getWatchedShowIds: function() {
            return this._request('/users/me/watched/shows')
                .then(function(data) {
                    var ids = new Set();
                    (data || []).forEach(function(item) {
                        if (item.show && item.show.ids && item.show.ids.trakt) {
                            ids.add(item.show.ids.trakt);
                        }
                    });
                    return ids;
                });
        },

        /**
         * Get movie watchlist IDs for efficient lookup
         * Returns a Set of Trakt movie IDs
         */
        getMovieWatchlistIds: function() {
            return this._request('/users/me/watchlist/movies')
                .then(function(data) {
                    var ids = new Set();
                    (data || []).forEach(function(item) {
                        if (item.movie && item.movie.ids && item.movie.ids.trakt) {
                            ids.add(item.movie.ids.trakt);
                        }
                    });
                    return ids;
                });
        },

        /**
         * Get show watchlist IDs for efficient lookup
         * Returns a Set of Trakt show IDs
         */
        getShowWatchlistIds: function() {
            return this._request('/users/me/watchlist/shows')
                .then(function(data) {
                    var ids = new Set();
                    (data || []).forEach(function(item) {
                        if (item.show && item.show.ids && item.show.ids.trakt) {
                            ids.add(item.show.ids.trakt);
                        }
                    });
                    return ids;
                });
        },

        /**
         * Get shows with new seasons available
         * Returns a Set of Trakt show IDs where next_episode is in a higher season than last watched
         */
        getShowsWithNewSeasons: function() {
            var self = this;

            return this._request('/users/me/watched/shows?extended=full')
                .then(function(watchedShows) {
                    if (!watchedShows || watchedShows.length === 0) {
                        return new Set();
                    }

                    // Get progress for all watched shows (limit to recent 20 for performance)
                    var recentShows = watchedShows
                        .sort(function(a, b) {
                            return new Date(b.last_watched_at) - new Date(a.last_watched_at);
                        })
                        .slice(0, 20);

                    var progressPromises = recentShows.map(function(ws) {
                        var showId = ws.show.ids.trakt;
                        return self._request('/shows/' + showId + '/progress/watched?extended=full')
                            .then(function(progress) {
                                return { show: ws.show, progress: progress };
                            })
                            .catch(function() {
                                return null;
                            });
                    });

                    return Promise.all(progressPromises);
                })
                .then(function(results) {
                    var newSeasonIds = new Set();

                    results.forEach(function(item) {
                        if (!item || !item.progress) return;

                        var progress = item.progress;
                        var showId = item.show.ids.trakt;

                        // Has next episode and it's in a new season
                        if (progress.next_episode && progress.last_episode) {
                            var nextSeason = progress.next_episode.season;
                            var lastWatchedSeason = progress.last_episode.season;

                            if (nextSeason > lastWatchedSeason) {
                                console.log('New season available for:', item.show.title,
                                    '(watched up to S' + lastWatchedSeason + ', next is S' + nextSeason + ')');
                                newSeasonIds.add(showId);
                            }
                        }
                    });

                    return newSeasonIds;
                })
                .catch(function(err) {
                    console.error('Failed to get shows with new seasons:', err);
                    return new Set();
                });
        },

        /**
         * Get detailed show progress including which episodes are watched
         * @param {string} showId - Trakt show ID, IMDB ID, or TMDB ID (prefixed with 'tmdb:')
         */
        getShowWatchedProgress: function(showId) {
            return this._request('/shows/' + showId + '/progress/watched?extended=full')
                .then(function(data) {
                    console.log('TraktClient: Show progress loaded', data);
                    return data || null;
                });
        },

        /**
         * Get show summary with full details including trailer
         * @param {string} id - Trakt ID, IMDB ID, or TMDB ID (use 'tmdb:123' format for TMDB)
         */
        getShowSummary: function(id) {
            return this._request('/shows/' + id + '?extended=full', { noAuth: true })
                .then(function(data) {
                    return data || null;
                })
                .catch(function() {
                    return null;
                });
        },

        /**
         * Get movie summary with full details including trailer
         * @param {string} id - Trakt ID, IMDB ID, or TMDB ID (use 'tmdb:123' format for TMDB)
         */
        getMovieSummary: function(id) {
            return this._request('/movies/' + id + '?extended=full', { noAuth: true })
                .then(function(data) {
                    return data || null;
                })
                .catch(function() {
                    return null;
                });
        },

        /**
         * Extract YouTube video key from a trailer URL
         * @param {string} url - YouTube URL
         */
        extractYouTubeKey: function(url) {
            if (!url) return null;
            var match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
            return match ? match[1] : null;
        },

        /**
         * Check if a specific episode is watched
         * Returns { watched: boolean, plays: number }
         */
        isEpisodeWatched: function(showId, seasonNumber, episodeNumber) {
            return this.getShowWatchedProgress(showId)
                .then(function(progress) {
                    if (!progress || !progress.seasons) {
                        return { watched: false, plays: 0 };
                    }

                    var season = progress.seasons.find(function(s) {
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
                });
        },

        // ==================== SYNC ACTIONS ====================

        /**
         * Mark an episode as watched
         * @param {object} show - Show object with ids
         * @param {number} seasonNum - Season number
         * @param {number} episodeNum - Episode number
         */
        markEpisodeWatched: function(show, seasonNum, episodeNum) {
            // Use shows format with season/episode numbers (Trakt API supports this)
            var body = {
                shows: [{
                    ids: show.ids,
                    seasons: [{
                        number: seasonNum,
                        episodes: [{
                            number: episodeNum,
                            watched_at: new Date().toISOString()
                        }]
                    }]
                }]
            };

            console.log('TraktClient: Marking episode S' + seasonNum + 'E' + episodeNum + ' as watched with show IDs:', JSON.stringify(show.ids));

            return this._request('/sync/history', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Mark watched response:', JSON.stringify(response));

                    // Validate response - Trakt returns added counts
                    if (response && response.added && response.added.episodes > 0) {
                        console.log('TraktClient: Episode S' + seasonNum + 'E' + episodeNum + ' successfully marked as watched');
                        return response;
                    }

                    // Check if episode was in not_found
                    if (response && response.not_found) {
                        var notFoundShows = response.not_found.shows || [];
                        var notFoundEpisodes = response.not_found.episodes || [];
                        if (notFoundShows.length > 0 || notFoundEpisodes.length > 0) {
                            console.error('TraktClient: Show/episode not found on Trakt:', response.not_found);
                            throw new Error('Episode not found on Trakt - check show IDs');
                        }
                    }

                    // If added.episodes is 0, the episode was already watched
                    console.log('TraktClient: Episode S' + seasonNum + 'E' + episodeNum + ' was already marked as watched');
                    return response;
                });
        },

        /**
         * Mark a movie as watched
         * @param {object} movie - Movie object with ids
         */
        markMovieWatched: function(movie) {
            var body = {
                movies: [{
                    watched_at: new Date().toISOString(),
                    ids: movie.ids
                }]
            };

            return this._request('/sync/history', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Movie marked as watched', response);
                    return response;
                });
        },

        /**
         * Mark a show as watched (all episodes)
         * @param {object} show - Show object with ids
         */
        markShowWatched: function(show) {
            var body = {
                shows: [{
                    watched_at: new Date().toISOString(),
                    ids: show.ids
                }]
            };

            return this._request('/sync/history', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Show marked as watched', response);
                    return response;
                });
        },

        /**
         * Add show to watchlist (favorites)
         * @param {object} show - Show object with ids
         */
        addShowToWatchlist: function(show) {
            var body = {
                shows: [{ ids: show.ids }]
            };

            return this._request('/sync/watchlist', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Show added to watchlist', response);
                    return response;
                });
        },

        /**
         * Add movie to watchlist (favorites)
         * @param {object} movie - Movie object with ids
         */
        addMovieToWatchlist: function(movie) {
            var body = {
                movies: [{ ids: movie.ids }]
            };

            return this._request('/sync/watchlist', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Movie added to watchlist', response);
                    return response;
                });
        },

        /**
         * Remove show from watchlist
         * @param {object} show - Show object with ids
         */
        removeShowFromWatchlist: function(show) {
            var body = {
                shows: [{ ids: show.ids }]
            };

            return this._request('/sync/watchlist/remove', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Show removed from watchlist', response);
                    return response;
                });
        },

        /**
         * Remove movie from watchlist
         * @param {object} movie - Movie object with ids
         */
        removeMovieFromWatchlist: function(movie) {
            var body = {
                movies: [{ ids: movie.ids }]
            };

            return this._request('/sync/watchlist/remove', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Movie removed from watchlist', response);
                    return response;
                });
        },

        /**
         * Remove episode from history (unwatch)
         * @param {object} show - Show object with ids
         * @param {number} seasonNum - Season number
         * @param {number} episodeNum - Episode number
         */
        removeEpisodeFromHistory: function(show, seasonNum, episodeNum) {
            // Use shows format with season/episode numbers (Trakt API supports this)
            var body = {
                shows: [{
                    ids: show.ids,
                    seasons: [{
                        number: seasonNum,
                        episodes: [{
                            number: episodeNum
                        }]
                    }]
                }]
            };

            console.log('TraktClient: Removing episode S' + seasonNum + 'E' + episodeNum + ' with show IDs:', JSON.stringify(show.ids));

            return this._request('/sync/history/remove', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Remove response:', JSON.stringify(response));

                    // Validate response - Trakt returns deleted counts
                    if (response && response.deleted && response.deleted.episodes > 0) {
                        console.log('TraktClient: Episode S' + seasonNum + 'E' + episodeNum + ' successfully removed from history');
                        return response;
                    }

                    // Check if episode was in not_found
                    if (response && response.not_found) {
                        var notFoundShows = response.not_found.shows || [];
                        var notFoundEpisodes = response.not_found.episodes || [];
                        if (notFoundShows.length > 0 || notFoundEpisodes.length > 0) {
                            console.warn('TraktClient: Episode not found in history - may not have been tracked:', response.not_found);
                        }
                    }

                    // If deleted.episodes is 0, the episode wasn't in history (already unwatched)
                    // This is still "successful" from the user's perspective
                    console.log('TraktClient: Episode S' + seasonNum + 'E' + episodeNum + ' was not in history (already unwatched)');
                    return response;
                });
        },

        /**
         * Remove show from history (unwatch all)
         * @param {object} show - Show object with ids
         */
        removeShowFromHistory: function(show) {
            var body = {
                shows: [{ ids: show.ids }]
            };

            return this._request('/sync/history/remove', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Show removed from history', response);
                    return response;
                });
        },

        /**
         * Remove movie from history (unwatch)
         * @param {object} movie - Movie object with ids
         */
        removeMovieFromHistory: function(movie) {
            var body = {
                movies: [{ ids: movie.ids }]
            };

            return this._request('/sync/history/remove', { method: 'POST', body: body })
                .then(function(response) {
                    console.log('TraktClient: Movie removed from history', response);
                    return response;
                });
        },

        // ==================== DISCOVER ENDPOINTS ====================

        /**
         * Build filter query string
         * @param {object} filters - Filter options (genres, years, ratings, networks, etc.)
         */
        _buildFilterQuery: function(filters) {
            if (!filters) return '';
            var params = [];

            if (filters.genres) params.push('genres=' + filters.genres);
            if (filters.years) params.push('years=' + filters.years);
            if (filters.ratings) params.push('ratings=' + filters.ratings);
            if (filters.networks) params.push('networks=' + filters.networks);
            if (filters.certifications) params.push('certifications=' + filters.certifications);
            if (filters.countries) params.push('countries=' + filters.countries);
            if (filters.languages) params.push('languages=' + filters.languages);
            if (filters.runtimes) params.push('runtimes=' + filters.runtimes);
            if (filters.status) params.push('status=' + filters.status);

            return params.length > 0 ? '&' + params.join('&') : '';
        },

        /**
         * Get list of all genres for movies
         */
        getMovieGenres: function() {
            return this._request('/genres/movies', { noAuth: true });
        },

        /**
         * Get list of all genres for shows
         */
        getShowGenres: function() {
            return this._request('/genres/shows', { noAuth: true });
        },

        /**
         * Get list of all TV networks
         */
        getNetworks: function() {
            return this._request('/networks', { noAuth: true });
        },

        /**
         * Get trending movies (what people are watching right now)
         */
        getTrendingMovies: function(page, limit, filters) {
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full' + this._buildFilterQuery(filters);
            return this._request('/movies/trending' + query, { noAuth: true });
        },

        /**
         * Get popular movies
         */
        getPopularMovies: function(page, limit, filters) {
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full' + this._buildFilterQuery(filters);
            return this._request('/movies/popular' + query, { noAuth: true });
        },

        /**
         * Get anticipated movies (most anticipated based on watchlist additions)
         */
        getAnticipatedMovies: function(page, limit, filters) {
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full' + this._buildFilterQuery(filters);
            return this._request('/movies/anticipated' + query, { noAuth: true });
        },

        /**
         * Get most watched movies
         * @param {string} period - weekly, monthly, yearly, all
         */
        getMostWatchedMovies: function(period, page, limit, filters) {
            period = period || 'weekly';
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full' + this._buildFilterQuery(filters);
            return this._request('/movies/watched/' + period + query, { noAuth: true });
        },

        /**
         * Get box office movies
         */
        getBoxOfficeMovies: function() {
            return this._request('/movies/boxoffice?extended=full', { noAuth: true });
        },

        /**
         * Get personalized movie recommendations (requires auth)
         */
        getRecommendedMovies: function(page, limit) {
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full';
            return this._request('/recommendations/movies' + query);
        },

        /**
         * Get trending shows (what people are watching right now)
         */
        getTrendingShows: function(page, limit, filters) {
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full' + this._buildFilterQuery(filters);
            return this._request('/shows/trending' + query, { noAuth: true });
        },

        /**
         * Get popular shows
         */
        getPopularShows: function(page, limit, filters) {
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full' + this._buildFilterQuery(filters);
            return this._request('/shows/popular' + query, { noAuth: true });
        },

        /**
         * Get anticipated shows (most anticipated based on watchlist additions)
         */
        getAnticipatedShows: function(page, limit, filters) {
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full' + this._buildFilterQuery(filters);
            return this._request('/shows/anticipated' + query, { noAuth: true });
        },

        /**
         * Get most watched shows
         * @param {string} period - weekly, monthly, yearly, all
         */
        getMostWatchedShows: function(period, page, limit, filters) {
            period = period || 'weekly';
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full' + this._buildFilterQuery(filters);
            return this._request('/shows/watched/' + period + query, { noAuth: true });
        },

        /**
         * Get personalized show recommendations (requires auth)
         */
        getRecommendedShows: function(page, limit) {
            page = page || 1;
            limit = limit || 20;
            var query = '?page=' + page + '&limit=' + limit + '&extended=full';
            return this._request('/recommendations/shows' + query);
        },

        // ==================== HELPER METHODS ====================

        /**
         * Get TMDB ID from Trakt item
         * Trakt items have ids.tmdb which we need for jfresolve
         */
        getTmdbId: function(item) {
            if (item && item.ids && item.ids.tmdb) {
                return item.ids.tmdb;
            }
            if (item && item.show && item.show.ids && item.show.ids.tmdb) {
                return item.show.ids.tmdb;
            }
            if (item && item.movie && item.movie.ids && item.movie.ids.tmdb) {
                return item.movie.ids.tmdb;
            }
            return null;
        },

        /**
         * Format show for display
         */
        formatShow: function(item) {
            var show = item.show || item;
            return {
                traktId: show.ids ? show.ids.trakt : null,
                tmdbId: show.ids ? show.ids.tmdb : null,
                imdbId: show.ids ? show.ids.imdb : null,
                title: show.title,
                year: show.year,
                overview: show.overview,
                runtime: show.runtime,
                rating: show.rating,
                network: show.network,
                status: show.status,
                type: 'show'
            };
        },

        /**
         * Format movie for display
         */
        formatMovie: function(item) {
            var movie = item.movie || item;
            return {
                traktId: movie.ids ? movie.ids.trakt : null,
                tmdbId: movie.ids ? movie.ids.tmdb : null,
                imdbId: movie.ids ? movie.ids.imdb : null,
                title: movie.title,
                year: movie.year,
                overview: movie.overview,
                runtime: movie.runtime,
                rating: movie.rating,
                type: 'movie'
            };
        },

        /**
         * Format episode for display
         */
        formatEpisode: function(item) {
            var episode = item.episode || item;
            var show = item.show;
            return {
                traktId: episode.ids ? episode.ids.trakt : null,
                tmdbId: episode.ids ? episode.ids.tmdb : null,
                showTmdbId: show && show.ids ? show.ids.tmdb : null,
                title: episode.title,
                season: episode.season,
                number: episode.number,
                overview: episode.overview,
                runtime: episode.runtime,
                rating: episode.rating,
                showTitle: show ? show.title : null,
                showYear: show ? show.year : null,
                type: 'episode'
            };
        },

        /**
         * Group episodes by show (for recently watched shows display)
         */
        groupEpisodesByShow: function(episodes) {
            var shows = {};
            episodes.forEach(function(item) {
                var show = item.show;
                if (!show || !show.ids) return;

                var showId = show.ids.trakt;
                if (!shows[showId]) {
                    shows[showId] = {
                        show: show,
                        latestEpisode: item.episode,
                        watchedAt: item.watched_at,
                        type: 'show'
                    };
                }
            });

            // Convert to array and sort by most recent
            return Object.values(shows).sort(function(a, b) {
                return new Date(b.watchedAt) - new Date(a.watchedAt);
            });
        }
    };

    // Export to window
    window.TraktClient = TraktClient;

})(window);
