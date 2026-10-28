'use strict';

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 4;

function clampZoom(value) {
  return Number.isFinite(value) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)) : 1;
}

function dimensions(value, name) {
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0) {
    throw new RangeError(`${name} must contain positive, finite width and height`);
  }
  return value;
}

function fitLayout(extent, requestedZoom, workArea) {
  dimensions(extent, 'extent');
  dimensions(workArea, 'workArea');
  const availableWidth = Math.max(1, Math.floor(workArea.width));
  const availableHeight = Math.max(1, Math.floor(workArea.height));
  const maxZoom = Math.min(MAX_ZOOM, availableWidth / extent.width, availableHeight / extent.height);
  // A display smaller than the minimum game size still needs to show the whole game.
  const minZoom = Math.min(MIN_ZOOM, maxZoom);
  const zoom = Math.min(clampZoom(requestedZoom), maxZoom);
  const sizeAt = value => ({
    width: Math.max(1, Math.round(extent.width * value)),
    height: Math.max(1, Math.round(extent.height * value))
  });
  const size = sizeAt(zoom), minimum = sizeAt(minZoom), maximum = sizeAt(maxZoom);
  return {
    zoom,
    width: size.width,
    height: size.height,
    minWidth: minimum.width,
    minHeight: minimum.height,
    maxWidth: maximum.width,
    maxHeight: maximum.height
  };
}

function zoomFromBounds(bounds, extent) {
  dimensions(bounds, 'bounds');
  dimensions(extent, 'extent');
  return clampZoom(Math.min(bounds.width / extent.width, bounds.height / extent.height));
}

module.exports = {MIN_ZOOM, MAX_ZOOM, clampZoom, fitLayout, zoomFromBounds};
