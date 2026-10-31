type Picture =
  "participate" | "receipt" | "verify" | "contacts" | "create" | "send";

/** 벡터 삽화는 옆의 제목·설명과 함께 읽는다. 외부 이미지 요청이 없다. */
export function GuidePicture({ kind }: { kind: Picture }) {
  return (
    <svg
      viewBox="0 0 260 160"
      fill="none"
      aria-hidden="true"
      className="h-full w-full"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="130" cy="144" rx="85" ry="9" fill="#dce7f7" opacity=".6" />
      <circle cx="208" cy="35" r="15" fill="#dfeaff" />
      <circle cx="48" cy="112" r="8" fill="#d6f5e7" />
      {kind === "participate" && (
        <>
          <rect
            x="85"
            y="10"
            width="91"
            height="135"
            rx="16"
            fill="white"
            stroke="#264a81"
            strokeWidth="3"
          />
          <path d="M116 19h28" stroke="#adc3e5" strokeWidth="4" />
          <rect x="97" y="36" width="67" height="32" rx="7" fill="#edf3ff" />
          <path d="M107 47h46m-46 10h28" stroke="#829ecc" strokeWidth="3" />
          <rect x="97" y="79" width="67" height="24" rx="6" fill="#315ff4" />
          <text
            x="130"
            y="95"
            textAnchor="middle"
            fill="white"
            fontSize="11"
            fontWeight="600"
          >
            투표하기
          </text>
          <path
            d="m154 95 0 28 7-8 10 4 4-7-21-17Z"
            fill="#d2f4e5"
            stroke="#239a76"
            strokeWidth="2"
          />
          <path d="m54 52 11 10 18-23" stroke="#26a780" strokeWidth="5" />
          <circle cx="130" cy="133" r="3" fill="#b5c7e2" />
        </>
      )}
      {kind === "receipt" && (
        <>
          <path
            d="M80 20h69l28 28v92H80V20Z"
            fill="white"
            stroke="#819fcb"
            strokeWidth="2"
          />
          <path
            d="M149 20v28h28"
            fill="#e9f0ff"
            stroke="#819fcb"
            strokeWidth="2"
          />
          <path
            d="M96 71h55m-55 13h40m-40 13h27"
            stroke="#b2c4df"
            strokeWidth="4"
          />
          <rect x="104" y="109" width="96" height="30" rx="8" fill="#315ff4" />
          <path d="M118 116v13m-4-4 4 4 4-4" stroke="white" strokeWidth="2" />
          <text
            x="160"
            y="129"
            textAnchor="middle"
            fill="white"
            fontSize="11"
            fontWeight="600"
          >
            영수증 저장
          </text>
          <circle cx="71" cy="45" r="20" fill="#ddf7ed" />
          <rect x="62" y="43" width="18" height="13" rx="3" fill="#28a57d" />
          <path
            d="M66 43v-5a5 5 0 0 1 10 0v5"
            stroke="#28a57d"
            strokeWidth="3"
          />
        </>
      )}
      {kind === "verify" && (
        <>
          <rect
            x="40"
            y="39"
            width="67"
            height="91"
            rx="9"
            fill="white"
            stroke="#91abd1"
            strokeWidth="2"
          />
          <rect
            x="151"
            y="24"
            width="67"
            height="106"
            rx="9"
            fill="white"
            stroke="#91abd1"
            strokeWidth="2"
          />
          <path
            d="M53 56h37m-37 11h26m74-20h51m-51 11h33"
            stroke="#bdcde3"
            strokeWidth="3"
          />
          <path
            d="M55 114V91m13 23V82m13 32V98m84 16V89m13 25V74m13 40V95"
            stroke="#7495ff"
            strokeWidth="8"
          />
          <path d="M115 81h28m-7-6 7 6-7 6" stroke="#315ff4" strokeWidth="3" />
          <circle
            cx="135"
            cy="112"
            r="21"
            fill="#ddf7ed"
            stroke="white"
            strokeWidth="4"
          />
          <path d="m125 112 7 7 13-15" stroke="#209b75" strokeWidth="4" />
        </>
      )}
      {kind === "contacts" && (
        <>
          <rect
            x="56"
            y="23"
            width="145"
            height="116"
            rx="12"
            fill="white"
            stroke="#8da7cf"
            strokeWidth="2"
          />
          {[49, 81, 113].map((y, i) => (
            <g key={y}>
              <circle
                cx="81"
                cy={y}
                r="10"
                fill={i === 1 ? "#dcf6eb" : "#e5edff"}
              />
              <path d={`M102 ${y - 4}h35`} stroke="#a9bedc" strokeWidth="4" />
              <rect
                x="150"
                y={y - 8}
                width="35"
                height="17"
                rx="8"
                fill={i === 1 ? "#dcf6eb" : "#e5edff"}
              />
            </g>
          ))}
          <circle cx="199" cy="33" r="19" fill="#315ff4" />
          <path d="M199 25v16m-8-8h16" stroke="white" strokeWidth="3" />
          <path
            d="M45 49h16m-16 32h16m-16 32h16"
            stroke="#315ff4"
            strokeWidth="4"
          />
        </>
      )}
      {kind === "create" && (
        <>
          <rect
            x="65"
            y="24"
            width="134"
            height="113"
            rx="12"
            fill="white"
            stroke="#8da7cf"
            strokeWidth="2"
          />
          <path d="M66 49h132" stroke="#d5e0f0" strokeWidth="2" />
          <path d="M93 17v17m77-17v17" stroke="#315ff4" strokeWidth="5" />
          {[76, 104].map((y) =>
            [90, 127, 164].map((x) => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="14"
                height="12"
                rx="3"
                fill="#e5edff"
              />
            )),
          )}
          <circle cx="165" cy="107" r="26" fill="#315ff4" />
          <path d="m153 107 8 8 16-18" stroke="white" strokeWidth="4" />
        </>
      )}
      {kind === "send" && (
        <>
          <rect
            x="42"
            y="47"
            width="119"
            height="77"
            rx="12"
            fill="white"
            stroke="#8da7cf"
            strokeWidth="2"
          />
          <path d="m44 51 57 43 58-43" stroke="#8da7cf" strokeWidth="2" />
          <path d="M111 30 209 49 167 83l-14-28-42-25Z" fill="#315ff4" />
          <path d="m153 55 56-6m-56 6 14 28" stroke="#a2b6ff" strokeWidth="2" />
          <circle cx="193" cy="120" r="23" fill="#dcf6eb" />
          <path d="m183 120 7 7 13-15" stroke="#209b75" strokeWidth="4" />
        </>
      )}
    </svg>
  );
}
