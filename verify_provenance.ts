
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:3003/api/cell/871ef4643ffffff'; // Example cell

async function checkCellProvenance() {
    try {
        console.log(`[TEST] Fetching cell data from ${API_URL}...`);
        const response = await axios.get(API_URL);

        console.log('[TEST] Response Status:', response.status);
        const data = response.data;

        if (data.data_status) {
            console.log('[TEST] Provenance Data Found:', JSON.stringify(data.data_status, null, 2));
        } else {
            console.error('[TEST] ERROR: No data_status field found in response.');
        }

        // Check if mocks are correctly identified
        const layers = ['dem', 'elsus', 'eshm20', 'clc', 'precipitation'];
        layers.forEach(layer => {
            const status = data.data_status?.[layer];
            if (status) {
                console.log(`[TEST] Layer ${layer}: Source=${status.source}, Mock=${status.isMock}`);
            } else {
                console.warn(`[TEST] Layer ${layer} missing in provenance.`);
            }
        });

    } catch (error: any) {
        if (error.response) {
            console.error(`[TEST] Request Failed: ${error.response.status} ${error.response.statusText}`);
            console.error('[TEST] Error Details:', error.response.data);
        } else {
            console.error('[TEST] Network Error:', error.message);
        }
    }
}

checkCellProvenance();
