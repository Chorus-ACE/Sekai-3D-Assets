const en = {
  'viewer.canvas': '3D model. Arrow keys rotate and move the view. Plus and minus zoom. Home resets the view.',
};
const strings = {
  en,
  'zh-Hans': {
    'viewer.canvas': '3D 模型。方向键旋转和移动视角，加减键缩放，Home 键重置视角。',
  },
  'zh-Hant': {
    'viewer.canvas': '3D 模型。方向鍵旋轉和移動視角，加減鍵縮放，Home 鍵重設視角。',
  },
  ja: {
    'viewer.canvas': '3Dモデル。矢印キーで回転・移動、プラス・マイナスで拡大・縮小、Homeで視点をリセット。',
  },
  ko: {
    'viewer.canvas': '3D 모델. 방향키로 회전·이동, 더하기·빼기로 확대·축소, Home 키로 시점을 초기화합니다.',
  },
};
export function viewerStrings(locale) {
  const value = String(locale).toLowerCase();
  const language = value.startsWith('zh') ? (/hant|tw|hk|mo/.test(value) ? 'zh-Hant' : 'zh-Hans') : value.split('-')[0];
  return { language: strings[language] ? language : 'en', values: strings[language] ?? en };
}
