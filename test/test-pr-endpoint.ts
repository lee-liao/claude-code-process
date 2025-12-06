/**
 * Test script to verify the /create-pull-request endpoint
 * Run with: npx tsx test-pr-endpoint.ts
 */

const API_BASE = "http://103.98.213.149:8510";

async function testCreatePullRequest() {
    console.log("Testing /create-pull-request endpoint...\n");

    // Test data - you may need to adjust these values
    const testData = {
        owner: "DrLinAITeam2",
        repo: "simplest-repo",
        title: "Test PR from API",
        body: "This is a test pull request created via the API endpoint test.",
        head: "hotfix-5d7cGNm5c-WlboePL8e_u", // An existing branch name
        base: "main"
    };

    console.log("Request payload:", JSON.stringify(testData, null, 2));
    console.log(`\nPOST ${API_BASE}/create-pull-request\n`);

    try {
        const response = await fetch(`${API_BASE}/create-pull-request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testData)
        });

        console.log(`Response status: ${response.status} ${response.statusText}`);

        const text = await response.text();
        console.log("Response body:", text);

        if (response.ok) {
            console.log("\n✅ SUCCESS: Endpoint is working!");
        } else {
            console.log("\n❌ FAILED: Endpoint returned an error.");
        }
    } catch (error) {
        console.error("\n❌ ERROR:", error);
    }
}

// Also test that the endpoint exists (OPTIONS or GET)
async function testEndpointExists() {
    console.log("\n--- Testing endpoint availability ---\n");

    const endpoints = [
        "/create-pull-request",
        "/create_pull_request",
        "/create-pr"
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}) // Empty body to trigger validation error, but not 404
            });

            const text = await response.text();
            const status = response.status;

            if (status === 404) {
                console.log(`❌ ${endpoint}: 404 Not Found`);
            } else if (status === 400) {
                console.log(`✅ ${endpoint}: Exists (400 - missing params is expected)`);
            } else {
                console.log(`⚠️ ${endpoint}: Status ${status} - ${text.substring(0, 100)}`);
            }
        } catch (error) {
            console.log(`❌ ${endpoint}: Error - ${error}`);
        }
    }
}

testEndpointExists().then(() => {
    console.log("\n--- Testing actual PR creation ---\n");
    return testCreatePullRequest();
});
