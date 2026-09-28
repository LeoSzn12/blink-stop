export function sharePayload(score) {
    return {
        title: 'Blink Stop',
        // Score-only until the owner publishes and verifies the matching web build/policy.
        text: `👁️ My Blink Stop result: ${score.toFixed(2)}s. #BlinkStop`
    };
}

export function shareClipboardText(score) {
    return sharePayload(score).text;
}
