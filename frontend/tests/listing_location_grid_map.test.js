import { describe, it, expect } from 'vitest';
import { listingLocationGridMapRenderer } from '../src/charts/listing_location_grid_map.js';

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
  listing_location_grid_last_3m: [
    { operation: 'sale', district: 'Extramurs', neighborhood: 'La Petxina', latitude: 39.474, longitude: -0.39, count_listings: 7 },
    { operation: 'rent', district: 'Ciutat Vella', neighborhood: 'El Carme', latitude: 39.478, longitude: -0.377, count_listings: 4 },
  ],
};

describe('listingLocationGridMapRenderer', () => {
  it('has a stable id and title', () => {
    expect(listingLocationGridMapRenderer.id).toBe('listing-location-grid-map');
    expect(typeof listingLocationGridMapRenderer.title).toBe('string');
  });

  it('consumes listing_location_grid_last_3m and uses marker size/text for count_listings', () => {
    const fig = listingLocationGridMapRenderer.render(dataBasis);
    expect(fig.data.length).toBeGreaterThan(0);
    const totalPoints = fig.data.reduce((sum, t) => sum + t.x.length, 0);
    expect(totalPoints).toBe(2);
    const trace = fig.data[0];
    expect(trace.type === 'scatter' || trace.type === 'scattergl').toBe(true);
    // Either marker size or text encodes count_listings.
    const encodesCount = fig.data.some(
      (t) =>
        (Array.isArray(t.marker?.size) && t.marker.size.includes(6 + 7 * 4)) ||
        (Array.isArray(t.text) && t.text.some((label) => String(label).includes('7'))),
    );
    expect(encodesCount).toBe(true);
  });

  it('draws a radius shape centered on the search_config center, with no external mapbox/tile config', () => {
    const fig = listingLocationGridMapRenderer.render(dataBasis);
    expect(Array.isArray(fig.layout.shapes)).toBe(true);
    expect(fig.layout.shapes.length).toBeGreaterThan(0);
    const circle = fig.layout.shapes[0];
    // Circle bounding box should be centered near the search_config center.
    const centerX = (circle.x0 + circle.x1) / 2;
    const centerY = (circle.y0 + circle.y1) / 2;
    expect(centerX).toBeCloseTo(-0.379561, 2);
    expect(centerY).toBeCloseTo(39.4693441, 2);

    // No Mapbox/tile references anywhere in the figure.
    const serialized = JSON.stringify(fig);
    expect(serialized.toLowerCase()).not.toContain('mapbox');
    expect(serialized.toLowerCase()).not.toContain('tile');
    expect(fig.layout.mapbox).toBeUndefined();
  });

  it('uses only the vendored Plotly trace/layout conventions (no external URLs anywhere in the figure)', () => {
    const fig = listingLocationGridMapRenderer.render(dataBasis);
    const serialized = JSON.stringify(fig);
    expect(serialized).not.toMatch(/https?:\/\//);
  });

  it('returns safe empty data/layout for missing data_basis input', () => {
    expect(listingLocationGridMapRenderer.render(null).data).toEqual([]);
    expect(listingLocationGridMapRenderer.render(undefined).data).toEqual([]);
    expect(listingLocationGridMapRenderer.render({}).data).toEqual([]);
    expect(listingLocationGridMapRenderer.render(null).layout).toBeTypeOf('object');
  });
});
