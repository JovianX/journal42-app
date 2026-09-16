import { useEffect } from 'react'
import { useAuth } from '../auth/useAuth'
import { getAiApiBase } from '../lib/ai'
import { bindPartnerCode } from '../lib/partnerApi'
import {
  capturePartnerCodeFromSearch,
  readPartnerCode,
  trackPartnerLinkFromSearch,
} from '../lib/partnerCode'

export default function PartnerAttribution() {
  const { user } = useAuth()

  useEffect(() => {
    trackPartnerLinkFromSearch(getAiApiBase())
  }, [])

  useEffect(() => {
    if (!user) return
    const code = capturePartnerCodeFromSearch() || readPartnerCode()
    if (!code) return
    void bindPartnerCode(user, code)
  }, [user])

  return null
}
