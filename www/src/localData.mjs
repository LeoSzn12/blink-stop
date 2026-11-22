// Every key Blink Stop keeps in local storage, so Clear my data removes all of it.
const BEST_MODES = ['CLASSIC', 'ENDURANCE', 'DAILY', 'SURPRISE', 'DISTRACT', 'BALLOON', 'FLASH', 'BEAT', 'PUMP', 'PRECISION_5', 'PRECISION_10', 'PRECISION_15'];
export const GAME_KEYS = [
    'blink_lb_CLASSIC', 'blink_lb_PRECISION', 'blink_lb_ENDURANCE', 'blink_lb_DAILY', 'blink_lb_SURPRISE', 'blink_lb_DISTRACT', 'blink_lb_BALLOON', 'blink_lb_FLASH', 'blink_lb_BEAT', 'blink_lb_PUMP',
    ...BEST_MODES.map(mode => `blink_best_${mode}`),
    'blink_theme_purple', 'blink_skin', 'blink_line', 'blink_lite_tracker', 'blink_haptics', 'blink_sound', 'blink_music',
];

export function clearStoredGameData(storage) {
    for (const key of GAME_KEYS) storage.removeItem(key);
}
