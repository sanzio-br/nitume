// CustomerAddressesApi (customer-v-new-category §W5, ND§Data): the saved
// addresses offered by the place fields. Through the #6 lazy interceptor.
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_V1 } from './errands.api';

/** `GET /customers/me/addresses` item (fields the web reads). */
export interface SavedAddress {
  readonly id: string;
  readonly label: string;
  readonly addressText: string;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly isDefault?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CustomerAddressesApi {
  private readonly http = inject(HttpClient);

  list(): Promise<SavedAddress[]> {
    return firstValueFrom(this.http.get<SavedAddress[]>(`${API_V1}/customers/me/addresses`));
  }
}
