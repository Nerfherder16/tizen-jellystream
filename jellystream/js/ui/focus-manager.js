/**
 * JellyStream - Focus Manager
 * Handles TV remote D-pad navigation for Samsung Tizen
 */
(function(window, document) {
    'use strict';

    var FocusManager = {
        initialized: false,
        currentFocus: null,
        focusableSelector: '.media-card, .btn, button, input, a[href], [tabindex="0"], .focusable',
        rowSelector: '.content-row',

        /**
         * Initialize focus manager
         */
        init: function() {
            if (this.initialized) return;

            console.log('FocusManager: Initializing');

            this.bindKeyEvents();
            this.initialized = true;

            console.log('FocusManager: Initialized');
        },

        /**
         * Bind keyboard/remote events
         */
        bindKeyEvents: function() {
            var self = this;

            document.addEventListener('keydown', function(e) {
                // Only handle navigation when not in an input
                if (document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.tagName === 'TEXTAREA') {
                    // Allow navigation out of inputs with arrow keys
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' &&
                        e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
                        return;
                    }
                }

                switch (e.key) {
                    case 'ArrowUp':
                        e.preventDefault();
                        self.navigate('up');
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        self.navigate('down');
                        break;
                    case 'ArrowLeft':
                        e.preventDefault();
                        self.navigate('left');
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        self.navigate('right');
                        break;
                    case 'Enter':
                        e.preventDefault();
                        self.select();
                        break;
                    case 'Escape':
                    case 'Backspace':
                        // Let lifecycle handle back navigation
                        break;
                }
            });
        },

        /**
         * Navigate in a direction
         */
        navigate: function(direction) {
            console.log('FocusManager: Navigate', direction);

            // Get current screen's focusable elements
            var activeScreen = document.querySelector('.screen.active');
            if (!activeScreen) return;

            var focusables = this.getFocusableElements(activeScreen);
            if (focusables.length === 0) return;

            // If no current focus, focus first element
            if (!this.currentFocus || !document.contains(this.currentFocus)) {
                this.setFocus(focusables[0]);
                return;
            }

            var nextElement = null;

            switch (direction) {
                case 'left':
                case 'right':
                    nextElement = this.findHorizontalNeighbor(direction, focusables);
                    break;
                case 'up':
                case 'down':
                    nextElement = this.findVerticalNeighbor(direction, focusables);
                    break;
            }

            if (nextElement) {
                this.setFocus(nextElement);
            }
        },

        /**
         * Find horizontal neighbor (left/right within same row)
         */
        findHorizontalNeighbor: function(direction, focusables) {
            var currentRow = this.getParentRow(this.currentFocus);
            var rowElements = currentRow
                ? Array.from(currentRow.querySelectorAll(this.focusableSelector))
                : focusables;

            var currentIndex = rowElements.indexOf(this.currentFocus);
            if (currentIndex === -1) return null;

            if (direction === 'left') {
                return currentIndex > 0 ? rowElements[currentIndex - 1] : null;
            } else {
                return currentIndex < rowElements.length - 1 ? rowElements[currentIndex + 1] : null;
            }
        },

        /**
         * Find vertical neighbor (up/down between rows)
         */
        findVerticalNeighbor: function(direction, focusables) {
            var currentRow = this.getParentRow(this.currentFocus);
            if (!currentRow) {
                // Not in a row, use simple index navigation
                var currentIndex = focusables.indexOf(this.currentFocus);
                if (direction === 'up') {
                    return currentIndex > 0 ? focusables[currentIndex - 1] : null;
                } else {
                    return currentIndex < focusables.length - 1 ? focusables[currentIndex + 1] : null;
                }
            }

            // Find all rows
            var activeScreen = document.querySelector('.screen.active');
            var rows = Array.from(activeScreen.querySelectorAll(this.rowSelector));
            var currentRowIndex = rows.indexOf(currentRow);

            if (currentRowIndex === -1) return null;

            // Find target row
            var targetRowIndex = direction === 'up' ? currentRowIndex - 1 : currentRowIndex + 1;

            // If no more rows in that direction, try to find other focusables
            if (targetRowIndex < 0 || targetRowIndex >= rows.length) {
                // Look for focusables outside of rows (like buttons)
                var outsideRowFocusables = focusables.filter(function(el) {
                    return !el.closest(this.rowSelector);
                }.bind(this));

                if (outsideRowFocusables.length > 0) {
                    if (direction === 'up' && targetRowIndex < 0) {
                        return outsideRowFocusables[outsideRowFocusables.length - 1];
                    } else if (direction === 'down' && targetRowIndex >= rows.length) {
                        return outsideRowFocusables[0];
                    }
                }
                return null;
            }

            var targetRow = rows[targetRowIndex];
            var targetElements = Array.from(targetRow.querySelectorAll(this.focusableSelector));

            if (targetElements.length === 0) return null;

            // Find element at similar horizontal position
            var currentRect = this.currentFocus.getBoundingClientRect();
            var currentCenter = currentRect.left + currentRect.width / 2;

            var closest = null;
            var closestDistance = Infinity;

            targetElements.forEach(function(el) {
                var rect = el.getBoundingClientRect();
                var center = rect.left + rect.width / 2;
                var distance = Math.abs(center - currentCenter);

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closest = el;
                }
            });

            return closest;
        },

        /**
         * Get parent row of an element
         */
        getParentRow: function(element) {
            return element ? element.closest(this.rowSelector) : null;
        },

        /**
         * Set focus on an element
         */
        setFocus: function(element) {
            if (!element) return;

            // Remove focus from current
            if (this.currentFocus) {
                this.currentFocus.classList.remove('focused');
                this.currentFocus.blur();
            }

            // Add focus to new element
            this.currentFocus = element;
            element.classList.add('focused');
            element.focus();

            // Scroll into view if needed
            this.scrollIntoViewIfNeeded(element);

            console.log('FocusManager: Focused', element.className, element.dataset);
        },

        /**
         * Clear current focus
         */
        clearFocus: function() {
            if (this.currentFocus) {
                this.currentFocus.classList.remove('focused');
                this.currentFocus.blur();
                this.currentFocus = null;
            }
        },

        /**
         * Focus first element on current screen
         */
        focusFirst: function() {
            var activeScreen = document.querySelector('.screen.active');
            if (!activeScreen) return;

            var focusables = this.getFocusableElements(activeScreen);
            if (focusables.length > 0) {
                this.setFocus(focusables[0]);
            }
        },

        /**
         * Get all focusable elements in container
         */
        getFocusableElements: function(container) {
            return Array.from(container.querySelectorAll(this.focusableSelector))
                .filter(function(el) {
                    // Only visible elements
                    return el.offsetParent !== null && !el.disabled;
                });
        },

        /**
         * Handle selection (Enter key)
         */
        select: function() {
            if (!this.currentFocus) {
                this.focusFirst();
                return;
            }

            console.log('FocusManager: Select', this.currentFocus);

            // Trigger click event
            this.currentFocus.click();
        },

        /**
         * Scroll element into view if needed
         */
        scrollIntoViewIfNeeded: function(element) {
            var rect = element.getBoundingClientRect();
            var parentRow = element.closest('.content-row');

            // Horizontal scroll for row
            if (parentRow) {
                var rowRect = parentRow.getBoundingClientRect();
                if (rect.left < rowRect.left) {
                    parentRow.scrollLeft -= (rowRect.left - rect.left + 50);
                } else if (rect.right > rowRect.right) {
                    parentRow.scrollLeft += (rect.right - rowRect.right + 50);
                }
            }

            // Vertical scroll for page
            if (rect.top < 100) {
                window.scrollBy(0, rect.top - 100);
            } else if (rect.bottom > window.innerHeight - 50) {
                window.scrollBy(0, rect.bottom - window.innerHeight + 50);
            }
        },

        /**
         * Refresh focusable elements (call after DOM changes)
         */
        refresh: function() {
            // If current focus is no longer in DOM, find new focus
            if (this.currentFocus && !document.contains(this.currentFocus)) {
                this.currentFocus = null;
                this.focusFirst();
            }
        }
    };

    // Export to global scope
    window.FocusManager = FocusManager;

})(window, document);
