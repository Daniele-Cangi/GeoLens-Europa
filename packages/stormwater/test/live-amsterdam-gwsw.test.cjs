const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PdokGwswAreaClient,
  assessGwswOutfallAreaContext,
} = require('../dist');

const liveEnabled =
  process.env.GEOLENS_LIVE_WATERNET === '1';
const bbox = {
  latMin: 52.3375,
  lonMin: 4.8978,
  latMax: 52.3395,
  lonMax: 4.8995,
};
const outfallPosition = {
  lat: 52.33807928535426,
  lon: 4.898945130628371,
};

test(
  'live PDOK GWSW area remains context-only for the selected Waternet outfall',
  { skip: !liveEnabled },
  async () => {
    const acquisition =
      await new PdokGwswAreaClient().acquire({ bbox });

    assert.equal(
      acquisition.status,
      'available',
      acquisition.status === 'available'
        ? undefined
        : acquisition.missingReason,
    );

    const context = assessGwswOutfallAreaContext({
      acquisition,
      outfallNodeId:
        'waternet:8522CE11-8DC1-41CC-9375-EDECAB742620',
      outfallPosition,
      waternetPumpingAreaReference: '826',
    });

    assert.equal(
      context.status,
      'unresolved_no_published_crosswalk',
    );
    assert.ok(
      context.containingRioleringsgebieden.some(
        (area) =>
          /Rioleringsgebied[.]932[)].*President Kennedylaan/.test(
            area.name,
          ),
      ),
    );
    assert.equal(
      context.waternetPumpingAreaReference.gwswCrosswalk,
      'not_published',
    );
    assert.equal(context.attachment.eligible, false);
    assert.equal(
      context.attachment.catchmentAttachmentCreated,
      false,
    );
    assert.equal(
      context.acquisition.provider,
      'PDOK',
    );
    assert.equal(
      context.acquisition.publisher,
      'Stichting RIONED',
    );
  },
);