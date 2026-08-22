export const PROOF_ZERO_NETWORK = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'node_A_inlet',
      properties: { type: 'inlet' },
      geometry: {
        type: 'Point',
        coordinates: [11.12, 46.07],
      },
    },
    {
      type: 'Feature',
      id: 'node_B_manhole',
      properties: { type: 'manhole' },
      geometry: {
        type: 'Point',
        coordinates: [11.1201, 46.0699],
      },
    },
    {
      type: 'Feature',
      id: 'node_C_outfall',
      properties: { type: 'outfall' },
      geometry: {
        type: 'Point',
        coordinates: [11.1202, 46.0698],
      },
    },
    {
      type: 'Feature',
      id: 'pipe_1_A_to_B',
      properties: {
        type: 'pipe',
        diameter_mm: 500,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [11.120002, 46.070001],
          [11.120098, 46.069902],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'pipe_2_B_to_C',
      properties: {
        type: 'pipe',
        diameter_mm: 600,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [11.120101, 46.069899],
          [11.120202, 46.069799],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'catchment_A',
      properties: {
        type: 'catchment',
        outlet_node_id: 'node_A_inlet',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [11.1199, 46.0701],
            [11.1201, 46.0701],
            [11.1201, 46.07005],
            [11.1199, 46.07005],
            [11.1199, 46.0701],
          ],
        ],
      },
    },
  ],
} as const;

export const PROOF_ZERO_NODE_POSITIONS = {
  node_A_inlet: { x: 260, y: 205, label: 'Inlet A' },
  node_B_manhole: { x: 440, y: 315, label: 'Manhole B' },
  node_C_outfall: { x: 625, y: 420, label: 'Outfall C' },
} as const;

export const PROOF_ZERO_PIPES = [
  {
    id: 'pipe_1_A_to_B',
    from: 'node_A_inlet',
    to: 'node_B_manhole',
  },
  {
    id: 'pipe_2_B_to_C',
    from: 'node_B_manhole',
    to: 'node_C_outfall',
  },
] as const;
