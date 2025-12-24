import React from "react"
import PromptIcon from '~/assets/prompt.svg?react'
import ImagePromptIcon from '~/assets/image-prompt.svg?react'

export function ChatOutlineIcon() {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="16" 
      height="16" 
      viewBox="0 0 24 24" 
      strokeWidth="3" 
      stroke="white" 
      fill="none" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="12" y2="18" />
    </svg>
  )
}

export function QuickQuoteIcon() {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="16" 
      height="16" 
      viewBox="0 0 512 512" 
      stroke="white"
    >
      <g fill="white" fillRule="evenodd">
        <path d="M106.667 85.333V128c0 80.756 64.102 146.54 144.2 149.246l5.133.087h149.333V320H256c-104.145 0-188.924-82.919-191.918-186.34L64 128.001V85.333z" />
        <path fillRule="nonzero" d="m315.582 217.751l30.17-30.17l111.085 111.085l-111.085 111.085l-30.17-30.17l80.898-80.915z" />
      </g>
    </svg>
  )
}

export function ExternalLinkIcon() {
  return (
    <span className="w-4 h-4 bg-no-repeat bg-center bg-contain opacity-80" 
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%235f6368' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'%3E%3C/path%3E%3Cpolyline points='15 3 21 3 21 9'%3E%3C/polyline%3E%3Cline x1='10' y1='14' x2='21' y2='3'%3E%3C/line%3E%3C/svg%3E")`
          }}
    />
  )
}

export { PromptIcon, ImagePromptIcon }