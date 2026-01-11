/**
 * JellyStream - Jellyseerr API Client
 * Handles all communication with Jellyseerr server
 */
(function (window) {
    'use strict';

    var JellyseerrAPI = {
        _baseUrl: null,
        _apiKey: null,
        _initialized: false,

        /**
         * Initialize the API client with server URL and API key
         */
        init: function (baseUrl, apiKey) {
            this._baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : null;
            this._apiKey = apiKey;
            this._initialized = !!(this._baseUrl && this._apiKey);
            console.log('JellyseerrAPI initialized:', this._initialized);
            return this._initialized;
        },

        /**
         * Check if the API is configured
         */
        isConfigured: function () {
            return this._initialized;
        },

        /**
         * Make an API request to Jellyseerr
         */
        _request: function (endpoint, options) {
            var self = this;
            options = options || {};

            if (!this._initialized) {
                return Promise.reject(new Error('Jellyseerr API not configured'));
            }

            var url = this._baseUrl + '/api/v1' + endpoint;
            var fetchOptions = {
                method: options.method || 'GET',
                headers: {
                    'X-Api-Key': this._apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            };

            if (options.body) {
                fetchOptions.body = JSON.stringify(options.body);
            }

            return fetch(url, fetchOptions)
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error('Jellyseerr API error: ' + response.status);
                    }
                    return response.json();
                })
                .catch(function (error) {
                    console.error('JellyseerrAPI request failed:', endpoint, error);
                    throw error;
                });
        },

        /**
         * Test connection to Jellyseerr server
         */
        testConnection: function () {
            return this._request('/status')
                .then(function (data) {
                    return { success: true, version: data.version };
                })
                .catch(function (error) {
                    return { success: false, error: error.message };
                });
        },

        /**
         * Get trending (combined movies and TV)
         */
        getTrending: function (page) {
            page = page || 1;
            return this._request('/discover/trending?page=' + page);
        },

        /**
         * Get trending movies
         */
        getTrendingMovies: function (page) {
            page = page || 1;
            return this._request('/discover/movies?page=' + page);
        },

        /**
         * Get trending TV shows
         */
        getTrendingTv: function (page) {
            page = page || 1;
            return this._request('/discover/tv?page=' + page);
        },

        /**
         * Get popular movies
         */
        getPopularMovies: function (page) {
            page = page || 1;
            return this._request('/discover/movies?page=' + page);
        },

        /**
         * Get popular TV shows
         */
        getPopularTv: function (page) {
            page = page || 1;
            return this._request('/discover/tv?page=' + page);
        },

        /**
         * Get upcoming movies
         */
        getUpcomingMovies: function (page) {
            page = page || 1;
            return this._request('/discover/movies/upcoming?page=' + page);
        },

        /**
         * Get upcoming TV shows
         */
        getUpcomingTv: function (page) {
            page = page || 1;
            var today = new Date().toISOString().split('T')[0];
            return this._request('/discover/tv?page=' + page + '&firstAirDateGte=' + today);
        },

        /**
         * Search for movies and TV shows
         */
        search: function (query, page) {
            page = page || 1;
            return this._request('/search?query=' + encodeURIComponent(query) + '&page=' + page);
        },

        /**
         * Get movie details
         */
        getMovie: function (tmdbId) {
            return this._request('/movie/' + tmdbId);
        },

        /**
         * Get TV show details
         */
        getTvShow: function (tmdbId) {
            return this._request('/tv/' + tmdbId);
        },

        /**
         * Get media details (movie or TV)
         */
        getMediaDetails: function (mediaType, tmdbId) {
            if (mediaType === 'movie') {
                return this.getMovie(tmdbId);
            } else {
                return this.getTvShow(tmdbId);
            }
        },

        /**
         * Discover by genre
         */
        discoverByGenre: function (mediaType, genreId, page) {
            page = page || 1;
            var endpoint = mediaType === 'movie' ? '/discover/movies' : '/discover/tv';
            return this._request(endpoint + '?page=' + page + '&genre=' + genreId);
        },

        /**
         * Get all requests (pending, approved, available)
         */
        getRequests: function (options) {
            options = options || {};
            var params = [];
            if (options.take) params.push('take=' + options.take);
            if (options.skip) params.push('skip=' + options.skip);
            if (options.filter) params.push('filter=' + options.filter);
            if (options.sort) params.push('sort=' + options.sort);

            var queryString = params.length ? '?' + params.join('&') : '';
            return this._request('/request' + queryString);
        },

        /**
         * Get user's own requests
         */
        getMyRequests: function (options) {
            options = options || {};
            var params = [];
            if (options.take) params.push('take=' + options.take);
            if (options.skip) params.push('skip=' + options.skip);

            var queryString = params.length ? '?' + params.join('&') : '';
            return this._request('/request/me' + queryString);
        },

        /**
         * Create a movie request
         */
        requestMovie: function (tmdbId) {
            return this._request('/request', {
                method: 'POST',
                body: {
                    mediaType: 'movie',
                    mediaId: tmdbId
                }
            });
        },

        /**
         * Create a TV show request
         */
        requestTv: function (tmdbId, seasons) {
            var body = {
                mediaType: 'tv',
                mediaId: tmdbId
            };
            if (seasons) {
                body.seasons = seasons;
            }
            return this._request('/request', {
                method: 'POST',
                body: body
            });
        },

        /**
         * Request media (movie or TV)
         */
        requestMedia: function (mediaType, tmdbId, seasons) {
            if (mediaType === 'movie') {
                return this.requestMovie(tmdbId);
            } else {
                return this.requestTv(tmdbId, seasons);
            }
        },

        /**
         * Get media status (availability in Jellyfin)
         */
        getMediaStatus: function (tmdbId, mediaType) {
            var endpoint = mediaType === 'movie' ? '/movie/' : '/tv/';
            return this._request(endpoint + tmdbId)
                .then(function (data) {
                    return {
                        mediaType: mediaType,
                        tmdbId: tmdbId,
                        status: data.mediaInfo ? data.mediaInfo.status : null,
                        jellyfinMediaId: data.mediaInfo ? data.mediaInfo.jellyfinMediaId : null,
                        available: data.mediaInfo && data.mediaInfo.status === 5,
                        requested: data.mediaInfo && data.mediaInfo.status >= 2
                    };
                });
        },

        /**
         * Get recently added media (available in Jellyfin via Jellyseerr)
         */
        getRecentlyAdded: function (take) {
            take = take || 20;
            return this._request('/media?take=' + take + '&filter=available&sort=added');
        },

        /**
         * Map Jellyseerr status code to human-readable string
         */
        getStatusText: function (statusCode) {
            var statusMap = {
                1: 'Unknown',
                2: 'Pending',
                3: 'Processing',
                4: 'Partially Available',
                5: 'Available'
            };
            return statusMap[statusCode] || 'Unknown';
        },

        /**
         * Map Jellyseerr status code to CSS class
         */
        getStatusClass: function (statusCode) {
            var classMap = {
                1: 'status-unknown',
                2: 'status-pending',
                3: 'status-processing',
                4: 'status-partial',
                5: 'status-available'
            };
            return classMap[statusCode] || 'status-unknown';
        }
    };

    // Export to window
    window.JellyseerrAPI = JellyseerrAPI;

})(window);
