import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { RecipeBook } from './RecipeBook'
import { Album } from './Album'

// The two things you kept, each on a page of its own, reached from the profile
// and leading back to it — not "back" in history, because these are also where
// the results screen sends somebody who has just added a recipe.

function ToProfile() {
  const { t } = useTranslation()
  return (
    <Link to="/profile" className="back-link">
      ← {t('profile.title')}
    </Link>
  )
}

export function RecipesPage() {
  const { t } = useTranslation()
  return (
    <div className="stack sheet keptpage">
      <ToProfile />
      <h1>{t('book.title')}</h1>
      <RecipeBook />
    </div>
  )
}

export function AlbumPage() {
  const { t } = useTranslation()
  return (
    <div className="stack sheet keptpage">
      <ToProfile />
      <h1>{t('album.profileTitle')}</h1>
      <Album />
    </div>
  )
}
