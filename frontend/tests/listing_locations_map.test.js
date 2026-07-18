import { describe, it, expect } from 'vitest';
import { listingLocationsMapRenderer } from '../src/charts/listing_locations_map.js';

const dataBasis = {
  search_config: [
    {
      center_lat: 39.4693441,
      center_lon: -0.379561,
      distance_m: 1500,
      min_size_m2: 100,
      max_size_m2: 160,
      elevator: true,
      preservation: 'good',
      property_type: 'homes',
      sale_credential_label: 'LVW',
      rent_credential_label: 'PMV',
    },
  ],
  listing_locations_last_3m: [
    { operation: 'sale', district: 'Extramurs', neighborhood: 'La Petxina', latitude: 39.474, longitude: -0.39 },
    { operation: 'rent', district: 'Ciutat Vella', neighborhood: 'El Carme', latitude: 39.478, longitude: -0.377 },
    { operation: 'sale', district: 'Extramurs', neighborhood: 'La Petxina', latitude: 39.4745, longitude: -0.391 },
  ],
};

describe('listingLocationsMapRenderer', () => {
  it('has a stable id and title', () => {
    expect(listingLocationsMapRenderer.id).toBe('listing-locations-map');
    expect(typeof listingLocationsMapRenderer.title).toBe('string');
  });

  it('consumes listing_locations_last_3m, one marker per listing, grouped by neighborhood', () => {
    const fig = listingLocationsMapRenderer.render(dataBasis);
    const markerTraces = fig.data.filter((t) => t.mode === 'markers');
    const totalPoints = markerTraces.reduce((sum, t) => sum + t.lon.length, 0);
    expect(totalPoints).toBe(3);
    // Two distinct neighborhoods in the fixture -> two marker traces.
    expect(markerTraces.length).toBe(2);
    expect(markerTraces.every((t) => t.type === 'scattermap')).toBe(true);
  });

  it('renders on a real basemap (open-street-map style, no mapbox token)', () => {
    const fig = listingLocationsMapRenderer.render(dataBasis);
    expect(fig.layout.map).toBeDefined();
    expect(fig.layout.map.style).toBe('open-street-map');
    expect(fig.layout.map.center).toEqual({ lon: -0.379561, lat: 39.4693441 });
  });

  it('draws a search-radius ring centered on the search_config center', () => {
    const fig = listingLocationsMapRenderer.render(dataBasis);
    const ringTrace = fig.data.find((t) => t.name === 'Search radius');
    expect(ringTrace).toBeDefined();
    const avgLon = ringTrace.lon.reduce((a, b) => a + b, 0) / ringTrace.lon.length;
    const avgLat = ringTrace.lat.reduce((a, b) => a + b, 0) / ringTrace.lat.length;
    expect(avgLon).toBeCloseTo(-0.379561, 2);
    expect(avgLat).toBeCloseTo(39.4693441, 2);
  });

  it('returns safe empty data/layout for missing data_basis input', () => {
    expect(listingLocationsMapRenderer.render(null).data).toEqual([]);
    expect(listingLocationsMapRenderer.render(undefined).data).toEqual([]);
    expect(listingLocationsMapRenderer.render({}).data).toEqual([]);
    expect(listingLocationsMapRenderer.render(null).layout).toBeTypeOf('object');
  });
});
