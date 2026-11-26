/**
 * Busts of the people on the radio, drawn as vector shapes in the ink-outlined style of the
 * UI kit. Parts that move carry classes the stylesheet animates from the voice level:
 * `.pt-mouth` opens, `.pt-eyes` blinks, `.pt-grille` (the machine's mouth) bounces.
 */

const INK = '#0d121d';

export type PortraitWho = 'alun' | 'sari' | 'damar' | 'rimba';

export function portraitWho(sender: string): PortraitWho {
  if (sender === 'A.L.U.N.') return 'alun';
  if (sender === 'BU SARI') return 'sari';
  if (sender === 'PAK DAMAR') return 'damar';
  return 'rimba';
}

const sari = `
  <path d="M6 202C9 186 17 172 32 162C44 155 56 152 70 151H130C144 152 156 155 168 162C183 172 191 186 194 202Z" fill="#28828b" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
  <path d="M20 182C24 173 31 166 40 161" stroke="#5eb0bb" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M100 176V202" stroke="${INK}" stroke-width="3"/>
  <circle cx="100" cy="193" r="2.8" fill="${INK}"/>
  <path d="M43 202V191.5Q43 189.5 45 189.5H76Q78 189.5 78 191.5V202" fill="#2a8a93" stroke="${INK}" stroke-width="3.2"/>
  <circle cx="60.5" cy="196" r="2.3" fill="${INK}"/>
  <path d="M131.5 190.5L136.5 178.5C134 177 133 174 134.5 171.5C136 169 139.5 168.5 141.5 170L139.5 174.5L142.5 175.8L144.5 171.2C146.5 173 146.8 176.5 145 178.5C143.5 180.2 141.5 180.6 139.8 180.2L134.8 192" fill="#8d939c" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M147 190L153 175.5L156.5 177L150.5 191.5Z" fill="#f07a2a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M122 202V191.5Q122 189.5 124 189.5H155Q157 189.5 157 191.5V202" fill="#2a8a93" stroke="${INK}" stroke-width="3.2"/>
  <circle cx="139.5" cy="196" r="2.3" fill="${INK}"/>
  <path d="M57 155L55 174.5L74.5 169L75 176.5L97 187.5L83 168.5Z" fill="#2b8f98" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M143 155L145 174.5L125.5 169L125 176.5L103 187.5L117 168.5Z" fill="#2b8f98" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M99 6.5C122 6.5 143 19 151 40C157 56 158 74 156 90C154 106 150 117 147 125C144 132 143 140 147 147L152.5 153C138 162 119 171 104 175C89 172 66 162 46 154L51.5 147C55.5 140 54.5 132 51.5 125C46 113 42 101 41.5 88C41 72 43 54 49 40C57 19 77 6.5 99 6.5Z" fill="#793c81" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
  <path d="M60 125C72 145 128 145 140 125C138 143 120 158 100 160C80 158 62 143 60 125Z" fill="#4d2c5c"/>
  <path d="M63 139C69 150 76 157 84 162M137 139C131 150 124 157 116 162" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <path d="M52 62C47 72 46 84 47 96" stroke="#a866b8" stroke-width="4.4" stroke-linecap="round" fill="none"/>
  <path d="M98 47.5C79 48.5 64 62 58.5 80.5C54.5 96 56 113 64 124.5C73.5 135.5 87.5 140 101 140C117 139.5 131 131 138 119C144 106 144.5 90 139.5 77C133.5 60 117 47 98 47.5Z" fill="#ed9e6d" stroke="${INK}" stroke-width="4.2"/>
  <path d="M55.5 37C47.5 40.5 42.5 47 40.5 56.5L46.5 59.5C48 51 52 45.5 58.5 42.5Z" fill="#694838" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
  <path d="M144.5 37C152.5 40.5 157.5 47 159.5 56.5L153.5 59.5C152 51 148 45.5 141.5 42.5Z" fill="#694838" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
  <rect x="88.5" y="18.5" width="23" height="11.5" rx="3.5" fill="#d5964a" stroke="${INK}" stroke-width="3.2"/>
  <ellipse cx="73.2" cy="29.6" rx="19.4" ry="17.6" fill="#d5964a" stroke="${INK}" stroke-width="4"/>
  <ellipse cx="72.8" cy="31.6" rx="15.4" ry="12.6" fill="#996536"/>
  <ellipse cx="72.6" cy="26.8" rx="13.6" ry="10" fill="#75c3e8" stroke="${INK}" stroke-width="2.8"/>
  <path d="M64.5 25.5C66 21.8 69.5 20 73.5 19.8" stroke="#d6f2ff" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <ellipse cx="126.8" cy="29.6" rx="19.4" ry="17.6" fill="#d5964a" stroke="${INK}" stroke-width="4"/>
  <ellipse cx="127.2" cy="31.6" rx="15.4" ry="12.6" fill="#996536"/>
  <ellipse cx="127.4" cy="26.8" rx="13.6" ry="10" fill="#75c3e8" stroke="${INK}" stroke-width="2.8"/>
  <path d="M119.3 25.5C120.8 21.8 124.3 20 128.3 19.8" stroke="#d6f2ff" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <path d="M66.5 66.5Q77 59.5 88.5 63.8M111.5 63.8Q123 59.5 133.5 66.5" stroke="${INK}" stroke-width="4.4" stroke-linecap="round" fill="none"/>
  <path d="M70.5 83.2Q79.8 75.8 89.5 82.2M110.5 82.2Q120.2 75.8 129.5 83.2" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <path d="M71 81.5L66.8 79.6M129 81.5L133.2 79.6" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
  <g class="pt-eyes">
    <ellipse cx="80" cy="84.2" rx="5.6" ry="6.4" fill="${INK}"/>
    <ellipse cx="120.4" cy="84.2" rx="5.6" ry="6.4" fill="${INK}"/>
    <circle cx="81.9" cy="81.6" r="1.8" fill="#ffffff"/>
    <circle cx="122.3" cy="81.6" r="1.8" fill="#ffffff"/>
  </g>
  <path d="M72.5 93.2Q80 96.6 87.5 93.2M112.5 93.2Q120 96.6 127.5 93.2" stroke="#b4643d" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M77.8 103.5Q75.2 108 77.6 112.6M122.2 103.5Q124.8 108 122.4 112.6" stroke="#b4643d" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M95.8 93.2C91.8 96.8 92.4 102.4 97.4 103.2C99.6 103.6 102.2 103 104 101.6" stroke="#7a3b22" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <path d="M126.5 101.5C130 97.5 138.5 97.8 139.5 101.8C140.3 105.6 134.8 108.8 129.6 108.2C125.6 107.6 124.6 104 126.5 101.5Z" fill="#685656" opacity="0.85"/>
  <path d="M129.2 111.2C131.6 109.4 136 109.6 135.8 111.6C135.4 113.6 131.2 114 129.6 113Z" fill="#685656" opacity="0.85"/>
  <g class="pt-mouth"><path d="M84.6 111.4Q100 118.6 115.4 111.4Q100 125.5 84.6 111.4Z" fill="#7a2323" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/></g>
  <path d="M95.4 122.6Q100 124.6 104.6 122.6" stroke="#b4643d" stroke-width="2" stroke-linecap="round" fill="none"/>`;

const damar = `
  <path d="M6 202C9 186 17 175 30 169C42 163 52 156 60 149H140C148 156 158 163 170 169C183 175 191 186 194 202Z" fill="#38669d" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
  <path d="M14 189.5H92M108 189.5H186M28 170H62M138 170H172" stroke="#ece4dc" stroke-width="4.6"/>
  <path d="M77 147C78 162 87 176 99 189C111 176 121 162 122 147Z" fill="#e2955a" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M78.5 150C86 158 94 161 100 161.5C106 161 114 158 121 150C119 155 112 160 100 162.5C88 160 81 155 78.5 150Z" fill="#bb7848"/>
  <path d="M68.5 146L60 159L57.5 179L72.5 173.5L92.5 184L76.5 164.5Z" fill="#3d70ab" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M131.5 146L140 159L142.5 179L127.5 173.5L107.5 184L123.5 164.5Z" fill="#3d70ab" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M8.5 92C14 104 30 112.5 45 114H155C170 112.5 186 104 191.5 92C170 79 30 79 8.5 92Z" fill="#7f502e" stroke="${INK}" stroke-width="4.2" stroke-linejoin="round"/>
  <path d="M40 104C30 103 20 99 14 94.5M160 104C170 103 180 99 186 94.5" stroke="#9c633a" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M42 96C40 86 44 77 52 74L60 72V104L50 106C46 104 43 100 42 96Z" fill="#2c2d38"/>
  <path d="M158 96C160 86 156 77 148 74L140 72V104L150 106C154 104 157 100 158 96Z" fill="#2c2d38"/>
  <path d="M47 80C45 86 46 92 50 95M152 80C154 86 154 92 150 95" stroke="#7d8291" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <path d="M47.5 111C43 107.5 37.5 108 37.5 113.5C37.5 119.5 41 125 47 127.5C51 129 55 128 56.5 125Z" fill="#e2955a" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M152.5 111C157 107.5 162.5 108 162.5 113.5C162.5 119.5 159 125 153 127.5C149 129 145 128 143.5 125Z" fill="#e2955a" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
  <path d="M44 114.5C46 113.2 48.5 114.5 49 117M156 114.5C154 113.2 151.5 114.5 151 117" stroke="#9c5a33" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <path d="M62 72C60 92 57 112 59 127C61 140 72 148 84 150.5C94 152.5 106 152.5 116 150.5C128 148 139 140 141 127C143 112 140 92 138 72Z" fill="#e2955a" stroke="${INK}" stroke-width="4.2" stroke-linejoin="round"/>
  <path d="M65 76C77 70 123 70 135 76" stroke="#bb7848" stroke-width="7" stroke-linecap="round" fill="none"/>
  <path d="M67.8 85.2C71 79.6 81 77.6 87.2 80.8C85 84 78 85 72 87.2C70 88 68 87.6 67.8 85.2Z" fill="#2c2d38" stroke="${INK}" stroke-width="2"/>
  <path d="M132.2 85.2C129 79.6 119 77.6 112.8 80.8C115 84 122 85 128 87.2C130 88 132 87.6 132.2 85.2Z" fill="#2c2d38" stroke="${INK}" stroke-width="2"/>
  <g class="pt-eyes">
    <path d="M71.5 97.6Q79 89.6 86.5 97.6M113.5 97.6Q121 89.6 128.5 97.6" stroke="${INK}" stroke-width="4.2" stroke-linecap="round" fill="none"/>
  </g>
  <path d="M64.5 93.6L61.2 92.2M64.6 97.8L61 98.6M135.5 93.6L138.8 92.2M135.4 97.8L139 98.6" stroke="#9c5a33" stroke-width="2" stroke-linecap="round"/>
  <path d="M74 101.6Q79.5 103.6 85 101.6M115 101.6Q120.5 103.6 126 101.6" stroke="#9c5a33" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M75.4 113.5Q72.8 119 75 124.5M124.6 113.5Q127.2 119 125 124.5" stroke="#9c5a33" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <path d="M88.2 106.4C86 102.6 89.8 99.6 93.8 101C96.2 99.4 103.8 99.4 106.2 101C110.2 99.6 114 102.6 111.8 106.4C110 109.8 104.6 111 100 110.2C95.4 111 90 109.8 88.2 106.4Z" fill="#e2955a" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
  <g class="pt-mouth"><path d="M88.4 127Q100 133.6 111.6 127Q100 141 88.4 127Z" fill="#6b1d1d" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/></g>
  <path d="M73.6 123.2C76 116.2 82 111.4 88 111.8C92.4 112.2 96.4 114 100 115.8C103.6 114 107.6 112.2 112 111.8C118 111.4 124 116.2 126.4 123.2C121.4 121 117.4 122 114 123.6C108.8 124.6 103.8 121.6 100 118.6C96.2 121.6 91.2 124.6 86 123.6C82.6 122 78.6 121 73.6 123.2Z" fill="#2c2d38" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M100 6.5L190.5 89.5C170 79 30 79 9.5 89.5Z" fill="#edb066" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
  <path d="M9.5 89.5C30 66 170 66 190.5 89.5C170 76 30 76 9.5 89.5Z" fill="#f4c27c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M100 7.5L100 68M100 7.5L72 69M100 7.5L128 69M100 7.5L46 72.5M100 7.5L154 72.5M100 7.5L24 79.5M100 7.5L176 79.5" stroke="#9c633a" stroke-width="2" fill="none"/>
  <path d="M66 32.5C84 28.5 116 28.5 134 32.5M47 50C74 44.5 126 44.5 153 50M29 66C66 58.5 134 58.5 171 66" stroke="#9c633a" stroke-width="2" fill="none"/>
  <path d="M84 21.5C78.5 26 74 31 71 36" stroke="#fbe0b0" stroke-width="3.4" stroke-linecap="round" fill="none"/>`;

const alun = `
  <path d="M22 202C24 191 30 184 40 181H160C170 184 176 191 178 202Z" fill="#f4f0ef" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
  <path d="M26 202C28 194 31 189 36 186L42 202ZM174 202C172 194 169 189 164 186L158 202Z" fill="#79e1ea" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="99" cy="177.5" rx="57.5" ry="21" fill="#f4f0ef" stroke="${INK}" stroke-width="4.4"/>
  <path d="M60.6 192.8C56 186 55.5 176 59 166.5L71.5 163.5C68 172 68.5 186 74 196.4ZM92 198.4C89.5 188 89.5 170 92 160.5H107C109.5 170 109.5 188 107 198.4ZM124.5 196.4C130 186 130.5 172 127 163.5L139.5 166.5C143 176 142.5 186 138 192.8Z" fill="#ed3f3f"/>
  <path d="M141 189C150 184 155 178 156 171" stroke="#b73232" stroke-width="5" stroke-linecap="round" fill="none"/>
  <ellipse cx="99" cy="177.5" rx="57.5" ry="21" fill="none" stroke="${INK}" stroke-width="4.4"/>
  <path d="M60.5 162C75 170.5 123 170.5 137.5 162" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M71.8 155.5H126.2V164C112 167.5 86 167.5 71.8 164Z" fill="#79e1ea" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
  <ellipse cx="31" cy="111.5" rx="12.5" ry="24.5" fill="#79e1ea" stroke="${INK}" stroke-width="4"/>
  <path d="M22 120C24 128 28 132.5 33 134" stroke="#58b6c5" stroke-width="4.4" stroke-linecap="round" fill="none"/>
  <ellipse cx="167" cy="111.5" rx="12.5" ry="24.5" fill="#79e1ea" stroke="${INK}" stroke-width="4"/>
  <path d="M176 120C174 128 170 132.5 165 134" stroke="#58b6c5" stroke-width="4.4" stroke-linecap="round" fill="none"/>
  <path d="M95 35.5H103.2L104.6 52.5H93.6Z" fill="#9e9daa" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M99 47C61 47 38 72 38 104C38 136 62 156 99 156C136 156 160 136 160 104C160 72 137 47 99 47Z" fill="#f4f0ef" stroke="${INK}" stroke-width="4.4"/>
  <path d="M154 120C147 141 128 152 99 153.5C128 149 148 137 156.5 110Z" fill="#c8c6ce"/>
  <path d="M65.5 59C76 52 88 49.5 99 49.5C111 49.5 123 52 133.5 59L125 71.5C124 73 122.5 73.5 120.8 73.5H78C76.3 73.5 74.8 73 74 71.5Z" fill="#79e1ea" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M127 61.5L120.5 71" stroke="#58b6c5" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="99" cy="53.2" rx="8.4" ry="3" fill="${INK}"/>
  <path d="M54 76.5C58 71.5 62 68.5 67 66.8" stroke="#ffffff" stroke-width="5.2" stroke-linecap="round" fill="none"/>
  <path d="M60 81C75 78.4 123 78.4 138 81C147 83 151 92 151 110C151 128 147 137 138 139.5C123 142.6 75 142.6 60 139.5C51 137 47 128 47 110C47 92 51 83 60 81Z" fill="#111829" stroke="${INK}" stroke-width="3.6"/>
  <g class="pt-eyes">
    <rect x="67.8" y="95" width="12.8" height="22.4" rx="6.4" fill="#40fafc"/>
    <rect x="117.4" y="95" width="12.8" height="22.4" rx="6.4" fill="#40fafc"/>
  </g>
  <g class="pt-grille">
    <rect x="84.6" y="123" width="4.6" height="6.6" rx="1.4" fill="#40fafc"/>
    <rect x="92.4" y="124" width="4.6" height="6.6" rx="1.4" fill="#40fafc"/>
    <rect x="100.2" y="124" width="4.6" height="6.6" rx="1.4" fill="#40fafc"/>
    <rect x="108" y="123" width="4.6" height="6.6" rx="1.4" fill="#40fafc"/>
  </g>
  <circle class="pt-led" cx="99" cy="20.8" r="15.2" fill="#fcd807" stroke="${INK}" stroke-width="4.2"/>
  <path d="M91.5 18.5C93 13.5 97 11 101.5 11.5" stroke="#fff6b8" stroke-width="3.6" stroke-linecap="round" fill="none"/>`;

const rimba = `
  <path d="M6 202C9 187 18 176 32 169L54 157H146L168 169C182 176 191 187 194 202Z" fill="#657b4a" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
  <path d="M30 172C26 182 25 192 26 202M170 172C174 182 175 192 174 202" stroke="#4c5f37" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M32 165L54 155L62 163L40 174Z" fill="#6f8752" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
  <path d="M168 165L146 155L138 163L160 174Z" fill="#6f8752" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
  <circle cx="54" cy="158.5" r="3.2" fill="#b39a62" stroke="${INK}" stroke-width="2"/>
  <circle cx="146" cy="158.5" r="3.2" fill="#b39a62" stroke="${INK}" stroke-width="2"/>
  <path d="M81 133C81 145 84 153 89 159L111 159C116 153 119 145 119 133Z" fill="#ea9c5d" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M82 138C90 146 110 146 118 138V145C110 151 90 151 82 145Z" fill="#b06d42"/>
  <path d="M88 158H112L109 167H91Z" fill="#375036"/>
  <path d="M68 143L84 158L100 178L82 175L72 180L64 162Z" fill="#6f8752" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M132 143L116 158L100 178L118 175L128 180L136 162Z" fill="#6f8752" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M100 178V202" stroke="${INK}" stroke-width="3"/>
  <circle cx="104" cy="191" r="3" fill="#8aa064" stroke="${INK}" stroke-width="2"/>
  <path d="M50 166L60 162L91 202H76Z" fill="#694633" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
  <path d="M129 181C132 175 139 171 146.5 171.5C147.5 179 143.5 187.5 135.5 189C132 189.6 129.5 187 129 181Z" fill="#a8c254" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
  <path d="M133 186L141.5 176.5M137.5 181.5L134.8 178.6M139.4 179.4L142.6 180.2" stroke="#4c6a2a" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M120 189.5H156V202H120Z" fill="#6f8752" stroke="${INK}" stroke-width="3"/>
  <path d="M8.8 78C14 92 28 104 46 111H154C172 104 186 92 191.2 78C170 64 30 64 8.8 78Z" fill="#8b6e45" stroke="${INK}" stroke-width="4.2" stroke-linejoin="round"/>
  <path d="M40.5 80C44 73 55 69 64 70C70 64 81 62 89 65C95 59 107 59 113 64C121 61 132 64 136 70C146 69 156 74 159 82L154 98L147 92L150 105L141 100L139 118L134 86C128 89 120 89 114 86L110 92L104 84C97 88 87 88 80 84L74 91L70 84L64 104L60 96L54 112L50 102L44 104Z" fill="#23252d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M60.5 100C56 96.6 50.2 98 49.8 104C49.4 110.6 54 117 60 118.6C63.4 119.4 65.6 117.6 66 115Z" fill="#ea9c5d" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M139.5 100C144 96.6 149.8 98 150.2 104C150.6 110.6 146 117 140 118.6C136.6 119.4 134.4 117.6 134 115Z" fill="#ea9c5d" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M56.5 104.5C58.6 103.6 60.6 105 60.8 107.5M143.5 104.5C141.4 103.6 139.4 105 139.2 107.5" stroke="#9a5a34" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <path d="M65 86C64 100 64.5 112 67.5 121C72 132 86 139.5 100 139.5C114 139.5 128 132 132.5 121C135.5 112 136 100 135 86C128 90 120 90 114 86L110 92L104 84C97 88 87 88 80 84L74 91L70 84C68.5 85 66.8 85.8 65 86Z" fill="#ea9c5d" stroke="${INK}" stroke-width="4.2" stroke-linejoin="round"/>
  <path d="M68.5 79.5L89.5 84.2L88 88L68 83.6Z" fill="#23252d" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M131.5 79.5L110.5 84.2L112 88L132 83.6Z" fill="#23252d" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
  <g class="pt-eyes">
    <ellipse cx="80.4" cy="94.6" rx="8" ry="9.8" fill="#fbf1e6" stroke="${INK}" stroke-width="2.6"/>
    <ellipse cx="119.6" cy="94.6" rx="8" ry="9.8" fill="#fbf1e6" stroke="${INK}" stroke-width="2.6"/>
    <ellipse cx="82" cy="95.6" rx="5.4" ry="7.2" fill="#2a1a12"/>
    <ellipse cx="118" cy="95.6" rx="5.4" ry="7.2" fill="#2a1a12"/>
    <circle cx="83.6" cy="92.4" r="2" fill="#ffffff"/>
    <circle cx="119.6" cy="92.4" r="2" fill="#ffffff"/>
  </g>
  <path d="M98.4 101.6L95.6 109.4H101.6" stroke="#b06d42" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M70.4 106.4H78.4M72 112.6H80M121.6 106.4H129.6M120 112.6H128" stroke="#b06d42" stroke-width="3" stroke-linecap="round"/>
  <g class="pt-mouth"><path d="M87 115.6Q100 122.4 113 115.6Q100 129 87 115.6Z" fill="#6f2020" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/></g>
  <path d="M86.5 66C93 70 97 76 98.5 84.5C93 80 88.5 77 82.5 76Z" fill="#23252d" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M103 64.5C110 67 115 72 116.5 80.5C111.5 77.5 106.5 76 101.5 76.5Z" fill="#23252d" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M8.8 78C30 40 170 40 191.2 78C170 64 30 64 8.8 78Z" fill="#d6b178" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M22 70.5C40 58 70 52.5 96 52" stroke="#ecd09e" stroke-width="3.4" stroke-linecap="round" fill="none"/>
  <path d="M54 55C55.5 37 62 18 80 10C88 6.5 97 8 104 12C108 8.5 116 7.5 121 10.5C138 20 144.5 38 146 55C130 61 70 61 54 55Z" fill="#d0aa70" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
  <path d="M116 13C120 18 124 23 127.5 26" stroke="#a08050" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <path d="M66 26C72 18 80 13 89 11.5" stroke="#f0d6a6" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M51.5 41C67 46.5 133 46.5 148.5 41L150 51.5C133 58 67 58 50 51.5Z" fill="#375036" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>`;

const ART: Record<PortraitWho, string> = { alun, sari, damar, rimba };

/** The face of whoever speaks, framed for a round medallion. */
export function portraitSvg(who: PortraitWho): string {
  return `<svg viewBox="0 0 200 200" aria-hidden="true">${ART[who]}</svg>`;
}

/** The same drawing on the reference grid, for checking it against the sketches it was drawn from. */
export function portraitArt(who: PortraitWho): string {
  return ART[who];
}
