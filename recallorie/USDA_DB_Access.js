// Configuration constants
const USDA_API_KEY = 'CVBeeTgj7ZdzecrAXOphkGbTSp41SEPwE1rxWcKn';
const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/**
 * Strips everything but digits, then strips leading zeros.
 * Used so "012345678905", "12345678905", and "0012345678905" all
 * compare equal regardless of how USDA or the scanner padded them.
 */
function normalizeDigits(str) {
    if (!str) return '';
    const digits = String(str).replace(/\D/g, '');
    const stripped = digits.replace(/^0+/, '');
    return stripped || '0';
}

/**
 * Looks up a food item by its UPC barcode using the USDA API.
 * @param {string} upc - The scanned or typed barcode string.
 */
async function lookupFoodByUPC(upc) {
    // 1. Clean the input to ensure it's just numbers
    let cleanUPC = upc.trim().replace(/\D/g, '');
    if (!cleanUPC) return;

    const targetNormalized = normalizeDigits(cleanUPC);

    // Standard US UPCs are 12 digits. Try both the 12-digit padded and
    // 11-digit depadded text variants, since the *text search* (not the
    // GTIN match itself) can behave differently depending on the exact
    // string sent.
    let upcFormatsToTry = [cleanUPC];
    if (cleanUPC.length === 11) {
        upcFormatsToTry.unshift('0' + cleanUPC);
    } else if (cleanUPC.length === 12 && cleanUPC.startsWith('0')) {
        upcFormatsToTry.push(cleanUPC.substring(1));
    }

    let foundFood = null;

    // 2. Loop through format variations
    for (let currentUPC of upcFormatsToTry) {
        try {
            // Using GET with query-string params instead of POST+JSON. A POST
            // with a Content-Type: application/json header is a "preflighted"
            // CORS request - the browser sends an OPTIONS request first, and
            // if the API doesn't answer that preflight with the right headers,
            // the browser blocks the whole thing client-side before any HTTP
            // status is ever produced. That matches what we saw in the console:
            // no response, no error body, just silence. A plain GET with no
            // custom headers is a "simple request" and is never preflighted.
            const params = new URLSearchParams({
                api_key: USDA_API_KEY,
                query: currentUPC,
                dataType: 'Branded',
                pageSize: '25'
            });
            const requestUrl = `${USDA_API_URL}?${params.toString()}`;
            console.log(`Querying USDA for barcode: ${currentUPC} -> ${requestUrl.replace(USDA_API_KEY, 'API_KEY')}`);

            const response = await fetch(requestUrl, { method: 'GET' });

            if (!response.ok) {
                // Read the body before throwing - USDA returns a JSON error
                // message (e.g. invalid/over-quota API key) that's otherwise lost.
                const errText = await response.text();
                console.error(`USDA API returned ${response.status} for "${currentUPC}":`, errText);
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();
            console.log(`USDA returned ${data.foods ? data.foods.length : 0} candidate(s) for "${currentUPC}". GTINs seen:`,
                (data.foods || []).map(f => f.gtinUpc));

            if (data.foods && data.foods.length > 0) {
                // Scan ALL returned candidates for an exact normalized GTIN match,
                // rather than trusting that foods[0] is correct.
                const match = data.foods.find(f =>
                    f.gtinUpc && normalizeDigits(f.gtinUpc) === targetNormalized
                );
                if (match) {
                    foundFood = match;
                    break;
                }
            }
        } catch (error) {
            console.error(`Error querying UPC ${currentUPC}: [${error.name}] ${error.message}`, error);
        }
    }

    // 3. Update the UI or prompt manual entry
    if (foundFood) {
        console.log("Success! Found item: ", foundFood.description);
        const parsedFood = extractNutritionData(foundFood);

        // Save to our local IndexedDB using the barcode
        saveFoodToLocalCache(cleanUPC, parsedFood);

        // Send to UI
        populateFormWithData(parsedFood);
        return;
    }

    // USDA's Branded Foods database has real coverage gaps (it's built from
    // GS1/GDSN + Label Insight submissions, and Label Insight stopped feeding
    // it new data in Nov 2023). Before giving up to manual entry, try Open
    // Food Facts - free, no API key, crowd-sourced from actual product labels,
    // much broader real-world barcode coverage.
    console.warn("Not in USDA. Trying Open Food Facts...");
    const offFood = await lookupFoodOnOpenFoodFacts(cleanUPC);
    if (offFood) {
        console.log("Success via Open Food Facts! Found item: ", offFood.description);
        saveFoodToLocalCache(cleanUPC, offFood);
        populateFormWithData(offFood);
        return;
    }

    console.warn("UPC not found in USDA or Open Food Facts. Redirecting to manual entry.");
    openManualEntryForm(cleanUPC);
}

/**
 * Fallback lookup against Open Food Facts, keyed straight off the barcode
 * (no fuzzy text search involved, so no format-variant guessing needed).
 * Returns data in the same per-100g shape as extractNutritionData(), or
 * null if not found.
 */
async function lookupFoodOnOpenFoodFacts(cleanUPC) {
    try {
        const url = `https://world.openfoodfacts.org/api/v2/product/${cleanUPC}.json`;
        console.log(`Querying Open Food Facts: ${url}`);
        const response = await fetch(url, { method: 'GET' });

        if (!response.ok) {
            console.error(`Open Food Facts returned ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.status !== 1 || !data.product) {
            console.log('Open Food Facts: no product for this barcode.');
            return null;
        }

        const p = data.product;
        const n = p.nutriments || {};

        return {
            description: p.product_name || p.generic_name || `Product ${cleanUPC}`,
            brand: p.brands || 'Generic',
            fdcId: null,

            // Open Food Facts reports nutriments per 100g directly under
            // the "_100g" suffixed keys, matching our per-100g storage basis.
            caloriesPer100g: n['energy-kcal_100g'] || 0,
            proteinPer100g: n['proteins_100g'] || 0,
            carbsPer100g: n['carbohydrates_100g'] || 0,
            fatPer100g: n['fat_100g'] || 0,

            servingSize: p.serving_quantity ? Number(p.serving_quantity) : null,
            servingSizeUnit: p.serving_quantity ? 'g' : null,
            householdServingText: p.serving_size || null
        };
    } catch (error) {
        console.error(`Error querying Open Food Facts: [${error.name}] ${error.message}`, error);
        return null;
    }
}

/**
 * Searches USDA by food name/description (not barcode) and returns a list
 * of candidate foods for the user to pick from, since a name search is
 * inherently ambiguous (many "banana" entries with different prep/brand).
 * Each candidate is already in our normalized per-100g shape.
 */
async function searchFoodsByName(queryText) {
    const results = [];
    try {
        const params = new URLSearchParams({
            api_key: USDA_API_KEY,
            query: queryText,
            // Search across all data types, not just Branded, so generic
            // foods like "banana" or "chicken breast" turn up too.
            pageSize: '15'
        });
        const requestUrl = `${USDA_API_URL}?${params.toString()}`;
        console.log(`Searching USDA by name: "${queryText}"`);

        const response = await fetch(requestUrl, { method: 'GET' });
        if (!response.ok) {
            const errText = await response.text();
            console.error(`USDA name search returned ${response.status}:`, errText);
        } else {
            const data = await response.json();
            console.log(`USDA name search returned ${data.foods ? data.foods.length : 0} result(s).`);
            for (const item of (data.foods || [])) {
                const parsed = extractNutritionData(item);
                // Use the fdcId as the cache key for name-searched items,
                // since there's no barcode to key off of.
                parsed.cacheKey = `fdc-${item.fdcId}`;
                results.push(parsed);
            }
        }
    } catch (error) {
        console.error(`Error searching USDA by name: [${error.name}] ${error.message}`, error);
    }
    return results;
}

/**
 * Helper function to parse out the messy USDA nutrient array into a clean JSON object.
 *
 * NOTE ON SCALING: USDA's foodNutrients array for Branded foods is reported
 * PER 100g of product (this is the FDC standard basis), regardless of the
 * product's actual serving size. So we store everything as "...Per100g" and
 * compute the actual macros for a given portion as (per100g value * grams / 100)
 * at display/log time. That's what lets us reuse a cached food across
 * different portion sizes without ever hitting the network again.
 */
function extractNutritionData(foodItem) {
    const nutrients = foodItem.foodNutrients || [];

    // IMPORTANT: the /foods/search endpoint returns an "abridged" nutrient
    // shape - { number: "208", name: "Energy", amount: 123, unitName: "KCAL" } -
    // NOT the { nutrientId: 1008, value: 123 } shape used by the /food/{fdcId}
    // details endpoint. The two use different numbering schemes entirely, so
    // we have to check both id conventions or the values silently come back
    // as 0. nutrientNumber below is the old NDB number (energy=208, protein=203,
    // carbs=205, fat=204); nutrientId is the newer numbering (1008/1003/1005/1004).
    const findNutrientValue = (nutrientNumber, nutrientId) => {
        const match = nutrients.find(n =>
            String(n.number) === String(nutrientNumber) ||
            String(n.nutrientNumber) === String(nutrientNumber) ||
            n.nutrientId === nutrientId ||
            n.id === nutrientId
        );
        if (!match) return 0;
        const val = match.amount !== undefined ? match.amount : match.value;
        return val || 0;
    };

    // servingSize/servingSizeUnit come straight off the product label when present.
    const servingSize = foodItem.servingSize || null;
    const servingSizeUnit = foodItem.servingSizeUnit || null;

    return {
        description: foodItem.description,
        brand: foodItem.brandOwner || 'Generic',
        fdcId: foodItem.fdcId,

        // Per-100g baseline nutrient values (USDA's standard reporting basis)
        caloriesPer100g: findNutrientValue(208, 1008), // Energy (KCAL)
        proteinPer100g: findNutrientValue(203, 1003),  // Protein (G)
        carbsPer100g: findNutrientValue(205, 1005),    // Carbohydrate, by difference (G)
        fatPer100g: findNutrientValue(204, 1004),      // Total lipid (fat) (G)

        // Label info, used to pre-fill a sensible default portion weight
        servingSize: servingSize,
        servingSizeUnit: servingSizeUnit,
        householdServingText: foodItem.householdServingFullText || null
    };
}

/**
 * Given a cached food record (per-100g basis) and an actual portion weight
 * in grams, returns the scaled macros for that portion.
 */
function scaleFoodToGrams(food, grams) {
    const ratio = (Number(grams) || 0) / 100;
    return {
        calories: (food.caloriesPer100g || 0) * ratio,
        protein: (food.proteinPer100g || 0) * ratio,
        carbs: (food.carbsPer100g || 0) * ratio,
        fat: (food.fatPer100g || 0) * ratio
    };
}
