// Document titles from route `data.title` (auth-foundation §2):
// `<title> · Nitume`, runner area `<title> · Nitume Runner`. Routes without
// a title keep the page's original title (marketing).
import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class NitumeTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly initial = this.title.getTitle();

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let title: string | null = null;
    let runner = false;
    for (let r: ActivatedRouteSnapshot | null = snapshot.root; r; r = r.firstChild) {
      const data = r.data as { title?: unknown; role?: unknown };
      if (typeof data.title === 'string') title = data.title;
      if (data.role === 'runner') runner = true;
      if (data.role === 'customer') runner = false;
    }
    this.title.setTitle(title ? `${title} · ${runner ? 'Nitume Runner' : 'Nitume'}` : this.initial);
  }
}
