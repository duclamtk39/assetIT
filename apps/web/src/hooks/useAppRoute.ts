import { useLocation, useNavigate } from 'react-router-dom'
import { pageForPath, pathForPage } from '../routing/routes'

export function useAppRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  return {
    page: pageForPath(location.pathname),
    setPage: (page: string) => navigate(pathForPage(page)),
  }
}
