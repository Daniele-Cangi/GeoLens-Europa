
import { latLngToCell } from 'h3-js';

// Use a coordinate slightly different from the original to get a new index
const lat = 46.0;
const lon = 11.0 + Math.random(); // Randomize longitude
const res = 7;
const index = latLngToCell(lat, lon, res);
console.log(index);
